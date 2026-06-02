import fs from 'fs';
import path from 'path';
import { Product, Chatbot } from '../../models/index.js';
import productEmbeddingService from '../embeddings/product-embedding.service.js';
import logger from '../../utils/logger.js';

export default class ProductService {
  /**
   * Crea un producto con imagen
   */
  create = async (chatbotId, workspaceId, productData, imageFile) => {
    try {
      const { sku, name, description, price, currency = 'CLP', stock = 0, category, tags = [] } = productData;

      // Validar campos requeridos
      if (!sku || !name || !price) {
        return { success: false, message: 'Faltan campos requeridos: sku, name, price' };
      }

      let imageUrl = null;
      let imagePath = null;

      // Si hay imagen, guardarla
      if (imageFile) {
        const uploadsDir = path.join(process.cwd(), 'uploads', 'products');
        const filename = `${chatbotId}-${sku}-${Date.now()}${path.extname(imageFile.name)}`;
        const savedPath = path.join(uploadsDir, filename);

        fs.copyFileSync(imageFile.tempFilePath, savedPath);
        imageUrl = `/uploads/products/${filename}`;
        imagePath = savedPath;

        console.log(`✅ Imagen guardada: ${imageUrl}`);
      }

      // Crear producto
      const product = new Product({
        chatbotId,
        workspaceId,
        sku,
        name,
        description,
        price: parseFloat(price),
        currency,
        stock: parseInt(stock) || 0,
        category,
        tags: Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim()),
        imageUrl,
        imagePath,
        source: 'manual',
        manuallyUploaded: !!imageFile,
        sourceMetadata: {
          syncStatus: 'synced',
          lastSyncedAt: new Date()
        }
      });

      await product.save();

      // Generar embedding de forma asíncrona (sin bloquear la respuesta)
      this.generateProductEmbeddingAsync(product, workspaceId);

      return {
        success: true,
        message: 'Producto creado exitosamente',
        data: product
      };
    } catch (error) {
      console.error('❌ ProductService.create:', error);
      return { success: false, message: error.message };
    }
  };

  /**
   * Obtiene todos los productos de un chatbot
   */
  list = async (chatbotId) => {
    try {
      const products = await Product.find({ chatbotId }).sort({ createdAt: -1 });
      return { success: true, message: 'Productos obtenidos', data: products };
    } catch (error) {
      console.error('❌ ProductService.list:', error);
      return { success: false, message: error.message };
    }
  };

  /**
   * Obtiene un producto por ID
   */
  get = async (productId) => {
    try {
      const product = await Product.findById(productId);
      if (!product) return { success: false, message: 'Producto no encontrado' };
      return { success: true, message: 'Producto obtenido', data: product };
    } catch (error) {
      console.error('❌ ProductService.get:', error);
      return { success: false, message: error.message };
    }
  };

  /**
   * Actualiza un producto
   */
  update = async (productId, updateData, imageFile) => {
    try {
      const product = await Product.findById(productId);
      if (!product) return { success: false, message: 'Producto no encontrado' };

      // Actualizar campos básicos
      if (updateData.name) product.name = updateData.name;
      if (updateData.description) product.description = updateData.description;
      if (updateData.price) product.price = parseFloat(updateData.price);
      if (updateData.stock !== undefined) product.stock = parseInt(updateData.stock);
      if (updateData.category) product.category = updateData.category;
      if (updateData.tags) product.tags = Array.isArray(updateData.tags) ? updateData.tags : updateData.tags.split(',').map(t => t.trim());
      if (updateData.imageUrl) product.imageUrl = updateData.imageUrl;
      if (updateData.sku) product.sku = updateData.sku;
      if (updateData.giftOccasion) product.giftOccasion = updateData.giftOccasion;

      // Si hay nueva imagen, guardarla y eliminar la antigua
      if (imageFile) {
        // Eliminar imagen anterior si existe
        if (product.imagePath && fs.existsSync(product.imagePath)) {
          fs.unlinkSync(product.imagePath);
        }

        const uploadsDir = path.join(process.cwd(), 'uploads', 'products');
        const filename = `${product.chatbotId}-${product.sku}-${Date.now()}${path.extname(imageFile.name)}`;
        const savedPath = path.join(uploadsDir, filename);

        fs.copyFileSync(imageFile.tempFilePath, savedPath);
        product.imageUrl = `/uploads/products/${filename}`;
        product.imagePath = savedPath;

        console.log(`✅ Imagen actualizada: ${product.imageUrl}`);
      }

      product.updatedAt = new Date();
      await product.save();

      return {
        success: true,
        message: 'Producto actualizado',
        data: product
      };
    } catch (error) {
      console.error('❌ ProductService.update:', error);
      return { success: false, message: error.message };
    }
  };

  /**
   * Elimina un producto (y su imagen)
   */
  delete = async (productId) => {
    try {
      const product = await Product.findById(productId);
      if (!product) return { success: false, message: 'Producto no encontrado' };

      // Eliminar imagen si existe
      if (product.imagePath && fs.existsSync(product.imagePath)) {
        fs.unlinkSync(product.imagePath);
        console.log(`✅ Imagen eliminada: ${product.imagePath}`);
      }

      await Product.deleteOne({ _id: productId });

      return { success: true, message: 'Producto eliminado' };
    } catch (error) {
      console.error('❌ ProductService.delete:', error);
      return { success: false, message: error.message };
    }
  };

  /**
   * Valida un producto antes de guardar
   */
  validateProduct = (product) => {
    const errors = [];
    if (!product.name) errors.push('Falta nombre');
    if (!product.sku) errors.push('Falta SKU');
    if (!product.price || product.price <= 0) errors.push('Precio inválido');
    if (product.price && isNaN(parseFloat(product.price))) errors.push('Precio no es número');
    return errors;
  };

  /**
   * Genera embedding para un producto de forma asíncrona
   */
  generateProductEmbeddingAsync = async (product, workspaceId) => {
    try {
      // Obtener la API key del chatbot (workspace)
      const chatbot = await Chatbot.findById(product.chatbotId);
      if (!chatbot || !chatbot.openaiApiKey) {
        logger.debug('Skipping embedding generation: OpenAI API key not configured', {
          productId: product._id
        });
        return;
      }

      const embeddingData = await productEmbeddingService.generateEmbedding(
        product,
        chatbot.openaiApiKey
      );

      if (embeddingData) {
        await Product.findByIdAndUpdate(product._id, {
          embedding: embeddingData.embedding,
          embeddingText: embeddingData.embeddingText
        });
      }
    } catch (error) {
      logger.error('Error in async embedding generation', {
        error: error.message,
        productId: product._id
      });
    }
  };

  /**
   * Genera embeddings para múltiples productos de forma asíncrona
   */
  generateProductEmbeddingsBatchAsync = async (products, workspaceId) => {
    try {
      if (!products || products.length === 0) return;

      // Obtener la API key del primer chatbot
      const chatbot = await Chatbot.findById(products[0].chatbotId);
      if (!chatbot || !chatbot.openaiApiKey) {
        logger.debug('Skipping batch embedding generation: OpenAI API key not configured');
        return;
      }

      const embeddingDataList = await productEmbeddingService.generateEmbeddingsBatch(
        products,
        chatbot.openaiApiKey
      );

      // Actualizar productos con sus embeddings
      for (const embeddingData of embeddingDataList) {
        await Product.findByIdAndUpdate(embeddingData.productId, {
          embedding: embeddingData.embedding,
          embeddingText: embeddingData.embeddingText
        });
      }

      logger.info('Batch embeddings stored', { count: embeddingDataList.length });
    } catch (error) {
      logger.error('Error in async batch embedding generation', {
        error: error.message,
        productsCount: products?.length
      });
    }
  };

  /**
   * Crea múltiples productos en bulk (CSV import)
   */
  bulkCreate = async (workspaceId, chatbotId, products) => {
    try {
      const validationErrors = [];
      const validProducts = [];

      // Validar cada producto
      for (const [idx, product] of products.entries()) {
        const errors = this.validateProduct(product);
        if (errors.length > 0) {
          validationErrors.push({
            rowIndex: idx + 1,
            sku: product.sku,
            errors
          });
          continue;
        }
        validProducts.push({
          ...product,
          chatbotId,
          workspaceId,
          price: parseFloat(product.price),
          tags: Array.isArray(product.tags)
            ? product.tags
            : (product.tags ? product.tags.split(',').map(t => t.trim()) : []),
          source: 'csv',
          sourceMetadata: {
            syncStatus: 'synced',
            lastSyncedAt: new Date()
          }
        });
      }

      // Si hay errores, retornar sin importar nada
      if (validationErrors.length > 0) {
        return {
          success: false,
          message: 'Hay errores de validación',
          data: { validationErrors, validCount: validProducts.length }
        };
      }

      // Deduplicar por SKU (el último gana)
      const uniqueProducts = Array.from(
        new Map(validProducts.map(p => [p.sku, p])).values()
      );

      const duplicates = validProducts.length - uniqueProducts.length;

      // Insert/Update en bulk usando findOneAndUpdate con upsert
      const results = await Promise.all(
        uniqueProducts.map(product =>
          Product.findOneAndUpdate(
            { chatbotId, sku: product.sku },
            product,
            { upsert: true, new: true }
          )
        )
      );

      console.log(`✅ ProductService.bulkCreate: ${results.length} productos importados (${duplicates} duplicados)`);

      // Generar embeddings de forma asíncrona para los productos importados
      this.generateProductEmbeddingsBatchAsync(results, workspaceId);

      return {
        success: true,
        message: `${results.length} productos importados ${duplicates > 0 ? `(${duplicates} duplicados)` : ''}`,
        data: {
          created: results.length,
          duplicates,
          products: results
        }
      };
    } catch (error) {
      console.error('❌ ProductService.bulkCreate:', error);
      return { success: false, message: error.message };
    }
  };
}
