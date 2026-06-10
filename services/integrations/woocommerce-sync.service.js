/**
 * WooCommerce → Bezpian Product Sync Service
 * Fetches all products from a WooCommerce store and upserts them into the Product collection.
 * Uses Basic Auth (Consumer Key / Consumer Secret) over HTTPS.
 */

import mongoose from 'mongoose';
import fetch from 'node-fetch';
import Product from '../../models/Product.js';
import Chatbot  from '../../models/Chatbot.js';
import logger   from '../../utils/logger.js';

// ── HTML strip helper ───────────────────────────────────────────────────────
function stripHtml(html = '') {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── Category path builder ───────────────────────────────────────────────────
// WooCommerce returns categories as an array [{id, name, slug}].
// We pick the first top-level category as `category` and the deepest as `subcategory`.
function mapCategories(wcCats = []) {
  if (!wcCats.length) return { category: '', subcategory: '' };
  // Use the last entry as the most specific (WooCommerce sends them ordered parent→child)
  const category    = wcCats[0]?.name || '';
  const subcategory = wcCats.length > 1 ? wcCats[wcCats.length - 1]?.name : '';
  return { category, subcategory };
}

// ── Attribute extractor ─────────────────────────────────────────────────────
function extractBrand(attributes = []) {
  const brandAttr = attributes.find(a =>
    ['marca', 'brand', 'fabricante'].includes(a.name?.toLowerCase())
  );
  return brandAttr?.options?.[0] || brandAttr?.option || '';
}

function extractTags(wcProduct) {
  const tags = (wcProduct.tags || []).map(t => t.name);
  // Also add category names as tags for better RAG matching
  const catTags = (wcProduct.categories || []).map(c => c.name);
  // Add brand as tag
  const brand = extractBrand(wcProduct.attributes || []);
  if (brand) catTags.push(brand);
  return [...new Set([...tags, ...catTags])].filter(Boolean);
}

// ── itemType detector ───────────────────────────────────────────────────────
function detectItemType(wcProduct) {
  const text = `${wcProduct.name} ${(wcProduct.categories||[]).map(c=>c.name).join(' ')}`.toLowerCase();
  if (/(servicio|service|consultoría|instalación|mantención)/.test(text)) return 'service';
  // Imfluid sells industrial products → always 'product'
  return 'product';
}

// ── Main fetch loop ─────────────────────────────────────────────────────────
async function fetchAllWooProducts(storeUrl, consumerKey, consumerSecret) {
  const base = storeUrl.replace(/\/$/, '');
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const allProducts = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = `${base}/wp-json/wc/v3/products?per_page=${perPage}&page=${page}&status=publish`;
    const resp = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`WooCommerce API error ${resp.status}: ${errText.slice(0, 200)}`);
    }

    const products = await resp.json();
    if (!products.length) break;
    allProducts.push(...products);

    const total = parseInt(resp.headers.get('x-wp-total') || '0', 10);
    if (allProducts.length >= total) break;
    page++;
  }

  return allProducts;
}

// ── Map WooCommerce product → Bezpian Product ────────────────────────────────
function mapProduct(wc, chatbotId, workspaceId) {
  const { category, subcategory } = mapCategories(wc.categories || []);
  const brand = extractBrand(wc.attributes || []);

  // Build a rich description
  const shortDesc = stripHtml(wc.short_description || '');
  const longDesc  = stripHtml(wc.description || '');
  const description = shortDesc || longDesc.slice(0, 500) || '';

  // Tags = wc tags + categories + brand
  const tags = extractTags(wc);

  // Attributes as variants
  const variants = (wc.attributes || [])
    .filter(a => a.variation || a.options?.length > 1)
    .map(a => ({
      name: a.name,
      options: a.options || [],
    }));

  return {
    chatbotId,
    workspaceId,
    itemType:    detectItemType(wc),
    // Omit sku entirely when empty so sparse index doesn't index it (null would conflict)
    ...(wc.sku ? { sku: wc.sku } : {}),
    name:        wc.name,
    description,
    price:       parseFloat(wc.price) || 0,
    currency:    'CLP',
    category,
    subcategory,
    tags,
    imageUrl:    wc.images?.[0]?.src || null,
    available:   wc.stock_status === 'instock' || wc.status === 'publish',
    brand:       brand || null,
    stock:       wc.stock_quantity ?? 0,
    variants:    variants.length ? variants : [],
    source:      'woocommerce',
    manuallyUploaded: false,
    sourceMetadata: {
      externalId:   String(wc.id),
      externalUrl:  wc.permalink || null,
      externalSku:  wc.sku || null,
      lastSyncedAt: new Date(),
      syncStatus:   'synced',
    },
    updatedAt: new Date(),
  };
}

// ── Public: run sync ────────────────────────────────────────────────────────
export async function syncWoocommerce(chatbotId) {
  const chatbot = await Chatbot.findById(chatbotId);
  if (!chatbot) throw new Error('Chatbot no encontrado');

  const { storeUrl, consumerKey, consumerSecret } = chatbot.woocommerceConfig || {};
  if (!storeUrl || !consumerKey || !consumerSecret) {
    throw new Error('Credenciales de WooCommerce no configuradas');
  }

  // Mark as syncing
  await Chatbot.findByIdAndUpdate(chatbotId, {
    'woocommerceConfig.lastSyncStatus': 'syncing',
    'woocommerceConfig.lastSyncError':  null,
  });

  let created = 0, updated = 0, failed = 0;

  try {
    logger.info('🔄 WooCommerce sync started', { chatbotId, storeUrl });

    const wcProducts = await fetchAllWooProducts(storeUrl, consumerKey, consumerSecret);
    logger.info(`📦 Fetched ${wcProducts.length} products from WooCommerce`);

    const workspaceId = chatbot.workspaceId;

    for (const wc of wcProducts) {
      try {
        const mapped = mapProduct(wc, chatbotId, workspaceId);

        // Upsert by externalId (WooCommerce product ID)
        const existing = await Product.findOne({
          chatbotId,
          'sourceMetadata.externalId': String(wc.id),
        });

        if (existing) {
          const updateOp = { $set: mapped };
          if (!wc.sku) updateOp.$unset = { sku: '' };
          await Product.findByIdAndUpdate(existing._id, updateOp);
          updated++;
        } else {
          await Product.create(mapped);
          created++;
        }
      } catch (err) {
        logger.warn('⚠️ Failed to sync product', { id: wc.id, name: wc.name, err: err.message });
        failed++;
      }
    }

    // Update sync metadata
    await Chatbot.findByIdAndUpdate(chatbotId, {
      'woocommerceConfig.lastSyncAt':     new Date(),
      'woocommerceConfig.lastSyncCount':  created + updated,
      'woocommerceConfig.lastSyncStatus': 'success',
      'woocommerceConfig.lastSyncError':  null,
      productLoadingMethod: 'woocommerce',
    });

    logger.info('✅ WooCommerce sync complete', { chatbotId, created, updated, failed });
    return { success: true, created, updated, failed, total: wcProducts.length };

  } catch (err) {
    await Chatbot.findByIdAndUpdate(chatbotId, {
      'woocommerceConfig.lastSyncStatus': 'error',
      'woocommerceConfig.lastSyncError':  err.message,
    });
    logger.error('❌ WooCommerce sync failed', { chatbotId, error: err.message });
    throw err;
  }
}

// ── Public: test connection ─────────────────────────────────────────────────
export async function testWoocommerceConnection(storeUrl, consumerKey, consumerSecret) {
  const base = storeUrl.replace(/\/$/, '');
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const url  = `${base}/wp-json/wc/v3/products?per_page=1`;

  const resp = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Conexión fallida (${resp.status}): ${errText.slice(0, 150)}`);
  }

  const total = parseInt(resp.headers.get('x-wp-total') || '0', 10);
  return { success: true, total };
}
