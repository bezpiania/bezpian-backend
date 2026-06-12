import { OpenAI } from 'openai';
import { encodingForModel } from 'js-tiktoken';
import DocumentChunk from '../../models/DocumentChunk.js';
import Product from '../../models/Product.js';
import CompanyInfo from '../../models/CompanyInfo.js';
import logger from '../../utils/logger.js';
import UnifiedSearchService from '../search/unified-search.service.js';
import RankingService from './ranking.service.js';
import GuardrailsService from './guardrails.service.js';
import CitationGeneratorService from './citation-generator.service.js';
import RedisCache from '../cache/redis-cache.service.js';
import LanguageDetector from '../language/language-detector.service.js';

let openai = null;

const enc = encodingForModel('gpt-3.5-turbo');

// Global defaults — can be overridden per chatbot via openaiSettings
const CONFIG = {
  MAX_CONTEXT_TOKENS: 2000,
  MAX_CHUNKS: 5,
  EMBEDDING_MODEL: 'text-embedding-3-small',
  SIMILARITY_THRESHOLD: 0.5,
  CACHE_TTL: 3600 // 1 hora
};

// Get config for a specific chatbot, falling back to global defaults
const getChatbotConfig = (chatbot) => ({
  MAX_CONTEXT_TOKENS: chatbot?.openaiSettings?.maxContextTokens || CONFIG.MAX_CONTEXT_TOKENS,
  MAX_CHUNKS:         chatbot?.openaiSettings?.maxChunks        || CONFIG.MAX_CHUNKS,
  EMBEDDING_MODEL:    CONFIG.EMBEDDING_MODEL,
  SIMILARITY_THRESHOLD: chatbot?.openaiSettings?.similarityThreshold || CONFIG.SIMILARITY_THRESHOLD,
  CACHE_TTL:          CONFIG.CACHE_TTL,
});

export default class AdvancedRAGService {
  constructor() {
    this.cache = new Map();
    this.embeddingCache = new Map();
  }

  /**
   * Busca documentos usando embeddings semánticos
   */
  async searchDocumentsBySemantics(chatbotId, query, limit = 5, apiKey = null) {
    try {
      // 1. Obtener embedding de la query
      const queryEmbedding = await this.getEmbedding(query, apiKey);
      if (!queryEmbedding) {
        throw new Error('No se pudo generar embedding de la query');
      }

      // 2. Buscar en MongoDB usando Vector Search
      const chunks = await DocumentChunk.aggregate([
        {
          $search: {
            cosmosSearch: {
              vector: queryEmbedding,
              k: limit
            },
            returnScoreDetails: 'cosineSimScore'
          }
        },
        {
          $match: {
            chatbotId: chatbotId
          }
        },
        {
          $project: {
            chunkId: '$_id',
            content: 1,
            source: 1,
            docId: 1,
            similarity: { $meta: 'searchScore' }
          }
        },
        {
          $limit: limit
        }
      ]).exec();

      // 3. Filtrar por threshold de relevancia
      const relevantChunks = chunks.filter(chunk =>
        chunk.similarity >= CONFIG.SIMILARITY_THRESHOLD
      );

      logger.info('RAG Search', {
        chatbotId,
        query,
        resultsFound: relevantChunks.length,
        avgSimilarity: relevantChunks.length > 0
          ? (relevantChunks.reduce((sum, c) => sum + c.similarity, 0) / relevantChunks.length).toFixed(3)
          : 0
      });

      return relevantChunks;
    } catch (error) {
      logger.error('Error en semantic search', { error: error.message, chatbotId, query });
      // Fallback a búsqueda simple
      return await this.searchDocumentsByKeyword(chatbotId, query, limit);
    }
  }

  /**
   * Búsqueda por palabras clave (fallback)
   */
  async searchDocumentsByKeyword(chatbotId, query, limit = 5) {
    try {
      const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const safeTerms = query.trim().split(/\s+/).filter(w => w.length > 2).map(escapeRe);
      if (safeTerms.length === 0) return [];
      const searchRegex = new RegExp(safeTerms.join('|'), 'i');

      const chunks = await DocumentChunk.find({
        chatbotId,
        content: searchRegex
      })
      .limit(limit)
      .lean();

      return chunks.map(chunk => ({
        chunkId: chunk._id,
        content: chunk.content,
        source: chunk.source,
        docId: chunk.docId,
        similarity: 0.5 // Score por defecto
      }));
    } catch (error) {
      logger.error('Error en keyword search', { error: error.message, chatbotId, query });
      return [];
    }
  }

  /**
   * Obtiene embedding de un texto (con cacheo)
   */
  async getEmbedding(text, apiKey = null) {
    try {
      // Verificar cache
      if (this.embeddingCache.has(text)) {
        const cached = this.embeddingCache.get(text);
        if (Date.now() - cached.timestamp < CONFIG.CACHE_TTL * 1000) {
          logger.debug('Embedding desde cache', { text: text.substring(0, 50) });
          return cached.embedding;
        }
      }

      // Usar API key del parámetro si se proporciona
      const key = apiKey || process.env.OPENAI_API_KEY;
      if (!key) {
        logger.error('No OpenAI API key available');
        return null;
      }

      // Inicializar OpenAI si no está listo
      if (!openai || (apiKey && !openai._apiKey)) {
        openai = new OpenAI({
          apiKey: key
        });
      }

      // Obtener embedding de OpenAI
      const response = await openai.embeddings.create({
        input: text,
        model: CONFIG.EMBEDDING_MODEL
      });

      const embedding = response.data[0].embedding;

      // Cachear resultado
      this.embeddingCache.set(text, {
        embedding,
        timestamp: Date.now()
      });

      logger.info('Embedding generado', {
        text: text.substring(0, 50),
        tokenUsage: response.usage.prompt_tokens
      });

      return embedding;
    } catch (error) {
      logger.error('Error generando embedding', { error: error.message, text: text.substring(0, 50) });
      return null;
    }
  }

  /**
   * Busca productos relevantes
   */
  /**
   * Busca productos usando embeddings semánticos inteligentes
   * Fallback a búsqueda por palabras clave si no hay embeddings
   */
  async searchProducts(chatbotId, query, limit = 3, apiKey = null) {
    try {
      console.log('🔎 [RAG] searchProducts START:', { chatbotId: chatbotId.toString(), query, hasApiKey: !!apiKey });

      // Intentar búsqueda vectorial inteligente primero
      const vectorResults = await this.searchProductsByVector(chatbotId, query, limit, apiKey);
      console.log('🔎 [RAG] Vector search results:', vectorResults.length);
      if (vectorResults.length > 0) {
        console.log('✅ [RAG] Returning vector results');
        return vectorResults;
      }

      // Fallback a búsqueda por palabras clave
      console.log('⚠️ [RAG] Falling back to keyword search');
      logger.debug('Falling back to keyword search for products', { chatbotId, query });
      const keywordResults = await this.searchProductsByKeyword(chatbotId, query, limit);
      console.log('🔎 [RAG] Keyword search results:', keywordResults.length);
      return keywordResults;
    } catch (error) {
      console.error('❌ [RAG] Error:', error.message);
      logger.error('Error buscando productos', { error: error.message, chatbotId, query });
      // Último recurso: búsqueda por palabras clave
      const fallbackResults = await this.searchProductsByKeyword(chatbotId, query, limit);
      console.log('🔎 [RAG] Fallback results:', fallbackResults.length);
      return fallbackResults;
    }
  }

  /**
   * Búsqueda inteligente de productos usando embeddings vectoriales
   */
  async searchProductsByVector(chatbotId, query, limit = 3, apiKey = null) {
    try {
      console.log('🔎 [RAG-VECTOR] Starting vector search, apiKey:', apiKey ? 'sk-proj-...' : 'null');
      // 1. Obtener embedding de la query
      const queryEmbedding = await this.getEmbedding(query, apiKey);
      if (!queryEmbedding) {
        console.log('❌ [RAG-VECTOR] Could not generate embedding');
        logger.debug('Could not generate embedding for product search');
        return [];
      }
      console.log('✅ [RAG-VECTOR] Embedding generated');

      // 2. Buscar productos con embeddings usando Vector Search
      const products = await Product.aggregate([
        {
          $search: {
            cosmosSearch: {
              vector: queryEmbedding,
              k: limit
            },
            returnScoreDetails: 'cosineSimScore'
          }
        },
        {
          $match: {
            chatbotId,
            embedding: { $exists: true, $ne: null }
          }
        },
        {
          $project: {
            _id: 1,
            name: 1,
            description: 1,
            price: 1,
            sku: 1,
            stock: 1,
            category: 1,
            tags: 1,
            imageUrl: 1,
            similarity: { $meta: 'searchScore' }
          }
        },
        {
          $limit: limit
        }
      ]).exec();

      logger.info('Product vector search', {
        chatbotId,
        query,
        resultsFound: products.length,
        avgSimilarity: products.length > 0
          ? (products.reduce((sum, p) => sum + (p.similarity || 0), 0) / products.length).toFixed(3)
          : 0
      });

      return products;
    } catch (error) {
      logger.debug('Vector search failed, will use keyword search', {
        error: error.message,
        chatbotId
      });
      return [];
    }
  }

  /**
   * Búsqueda por palabras clave para productos (fallback)
   * Usa Full-Text Search de MongoDB - la forma profesional
   */
  async searchProductsByKeyword(chatbotId, query, limit = 3) {
    try {
      console.log('🔎 [KEYWORD] Starting full-text search:', { query, chatbotId: chatbotId.toString() });

      // OPCIÓN 1: Full-Text Search de MongoDB (la forma profesional)
      // Preserva caracteres especiales, maneja sinónimos, y es muy rápido
      const products = await Product.find(
        {
          chatbotId,
          $text: { $search: query }  // MongoDB Full-Text Search
        },
        {
          score: { $meta: 'textScore' }  // Obtener puntuación de relevancia
        }
      )
      .sort({ score: { $meta: 'textScore' } })  // Ordenar por relevancia
      .limit(limit)
      .select('name description price sku stock category tags imageUrl')
      .lean();

      console.log('✅ [KEYWORD] Full-text search found:', products.length, 'products');
      products.forEach(p => console.log(`  - ${p.name}`));

      // Si encontró resultados, retornarlos
      if (products.length > 0) {
        return products;
      }

      // FALLBACK: Si Full-Text Search no encontró nada, usar búsqueda simple por palabras clave
      console.log('⚠️ [KEYWORD] Full-text search empty, trying regex fallback');
      // Escape special regex characters to avoid "Invalid regular expression" errors
      // e.g. phone numbers like +56912345678 contain + which breaks regex
      const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const cleanQuery = query
        .trim()
        .split(/\s+/)
        .filter(w => w.length > 2)   // skip very short words (es, mi, un, etc.)
        .map(escapeRegex);

      if (cleanQuery.length === 0) return [];

      const fallbackProducts = await Product.find({
        chatbotId,
        $or: [
          { name: { $regex: cleanQuery.join('|'), $options: 'i' } },
          { description: { $regex: cleanQuery.join('|'), $options: 'i' } },
          { tags: { $regex: cleanQuery.join('|'), $options: 'i' } }
        ]
      })
      .limit(limit)
      .select('name description price sku stock category tags imageUrl')
      .lean();

      console.log('✅ [KEYWORD] Regex fallback found:', fallbackProducts.length, 'products');
      fallbackProducts.forEach(p => console.log(`  - ${p.name}`));

      logger.debug('Product keyword search', {
        chatbotId,
        query,
        resultsFound: fallbackProducts.length,
        method: 'regex-fallback'
      });

      return fallbackProducts;
    } catch (error) {
      console.error('❌ [KEYWORD] Error:', error.message);

      // Si Full-Text Search falla (ej: índice no creado), usar regex simple
      if (error.message.includes('text index')) {
        console.log('⚠️ [KEYWORD] Full-text index not available, using simple regex');
        try {
          const simpleProducts = await Product.find({
            chatbotId,
            $or: [
              { name: { $regex: query, $options: 'i' } },
              { description: { $regex: query, $options: 'i' } },
              { tags: { $regex: query, $options: 'i' } }
            ]
          })
          .limit(limit)
          .select('name description price sku stock category tags imageUrl')
          .lean();

          return simpleProducts;
        } catch (e) {
          console.error('❌ [KEYWORD] Simple regex also failed:', e.message);
          return [];
        }
      }

      logger.error('Keyword search for products failed', {
        error: error.message,
        chatbotId,
        query
      });
      return [];
    }
  }

  /**
   * Detecta si la query es una pregunta de regalo y busca productos para esa ocasión
   */
  async searchGiftProducts(chatbotId, query, limit = 5) {
    try {
      // Palabras clave para detectar intención de regalo
      const giftKeywords = {
        regalo: ['regalo', 'regalar', 'obsequio', 'present'],
        mothers_day: ['mamá', 'mama', 'madre', 'día de mamá', 'día de la madre'],
        fathers_day: ['papá', 'papa', 'padre', 'día de papá', 'día del padre'],
        birthday: ['cumpleaños', 'cumple', 'birthday', 'años'],
        anniversary: ['aniversario', 'aniversario'],
        christmas: ['navidad', 'navideño', 'christmas'],
        valentines: ['san valentín', 'valentine', 'valentina'],
        graduation: ['graduación', 'graduado'],
        newborn: ['bebé', 'bebe', 'recién nacido', 'recien nacido'],
        get_well: ['recuperación', 'mejora', 'salud'],
        thank_you: ['agradecimiento', 'gracias', 'regalo de gracias']
      };

      const queryLower = query.toLowerCase();

      // Detectar si es una pregunta de regalo
      const isGiftQuery = giftKeywords.regalo.some(word => queryLower.includes(word));
      if (!isGiftQuery) {
        return { isGift: false, products: [] };
      }

      // Detectar cuál ocasión específica
      let detectedOccasion = null;
      for (const [occasion, keywords] of Object.entries(giftKeywords)) {
        if (occasion !== 'regalo' && keywords.some(word => queryLower.includes(word))) {
          detectedOccasion = occasion;
          break;
        }
      }

      // Si no se detectó ocasión específica, retornar que es regalo pero sin ocasión
      if (!detectedOccasion) {
        return { isGift: true, occasion: null, products: [] };
      }

      console.log(`🎁 [GIFT] Detected gift query for occasion: ${detectedOccasion}`);

      // Buscar productos con esa ocasión
      const giftProducts = await Product.find({
        chatbotId,
        'giftOccasion.occasion': detectedOccasion,
        stock: { $gt: 0 } // Solo productos con stock disponible
      })
      .select('name description price stock category giftOccasion imageUrl')
      .limit(limit)
      .lean();

      console.log(`✅ [GIFT] Found ${giftProducts.length} gift products for ${detectedOccasion}`);

      return {
        isGift: true,
        occasion: detectedOccasion,
        occasionLabel: this.getOccasionLabel(detectedOccasion),
        products: giftProducts
      };
    } catch (error) {
      console.error('❌ [GIFT] Error searching gift products:', error.message);
      logger.error('Error searching gift products', { error: error.message, chatbotId, query });
      return { isGift: false, products: [] };
    }
  }

  /**
   * Convierte ocasión a etiqueta legible
   */
  getOccasionLabel(occasion) {
    const labels = {
      mothers_day: 'Día de mamá',
      fathers_day: 'Día de papá',
      birthday: 'Cumpleaños',
      anniversary: 'Aniversario',
      christmas: 'Navidad',
      valentines: 'San Valentín',
      graduation: 'Graduación',
      newborn: 'Bienvenida bebé',
      get_well: 'Recuperación',
      thank_you: 'Agradecimiento'
    };
    return labels[occasion] || occasion;
  }

  /**
   * Construye contexto optimizado para OpenAI
   */
  buildContext(chunks, products, customPrompt) {
    try {
      let context = '';
      let tokenCount = 0;

      // Agregar documentos
      if (chunks && chunks.length > 0) {
        context += 'INFORMACIÓN DE LA EMPRESA (Documentos):\n';
        context += '=====================================\n\n';

        for (const chunk of chunks) {
          const chunkContent = `Fuente: ${chunk.source}\nContenido: ${chunk.content}\n---\n`;
          const chunkTokens = enc.encode(chunkContent).length;

          // Verificar si cabe en el límite
          if (tokenCount + chunkTokens > CONFIG.MAX_CONTEXT_TOKENS) {
            logger.warn('Contexto excede límite de tokens', {
              currentTokens: tokenCount,
              chunkTokens,
              limit: CONFIG.MAX_CONTEXT_TOKENS
            });
            break;
          }

          context += chunkContent;
          tokenCount += chunkTokens;
        }
      }

      // Agregar productos
      if (products && products.length > 0) {
        context += '\nCATÁLOGO DE PRODUCTOS DISPONIBLES:\n';
        context += '==================================\n\n';

        for (const product of products) {
          let productText = `Producto: ${product.name}\n`;
          if (product.description) productText += `Descripción: ${product.description}\n`;
          productText += `Precio: $${product.price || 'N/A'} (${product.category || 'Sin categoría'})\n`;
          productText += `Stock: ${product.stock > 0 ? product.stock + ' unidades' : 'No disponible'}\n`;
          if (product.tags && product.tags.length > 0) {
            productText += `Tags: ${product.tags.join(', ')}\n`;
          }
          if (product.similarity) {
            productText += `Relevancia: ${(product.similarity * 100).toFixed(0)}%\n`;
          }
          productText += '---\n';

          const productTokens = enc.encode(productText).length;

          if (tokenCount + productTokens > CONFIG.MAX_CONTEXT_TOKENS) {
            logger.warn('Catálogo excede límite de tokens', { productsIncluded: context.split('---').length - 1 });
            break;
          }

          context += productText;
          tokenCount += productTokens;
        }
      }

      logger.info('Contexto construido', {
        totalTokens: tokenCount,
        chunksIncluded: chunks ? chunks.length : 0,
        productsIncluded: products ? products.length : 0,
        customPromptIncluded: !!customPrompt
      });

      return context;
    } catch (error) {
      logger.error('Error construyendo contexto', { error: error.message });
      return '';
    }
  }

  /**
   * Cachea respuesta para queries similares
   */
  getCachedResponse(chatbotId, query) {
    const cacheKey = `${chatbotId}:${query}`;

    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < CONFIG.CACHE_TTL * 1000) {
        logger.info('Respuesta desde cache', { cacheKey: cacheKey.substring(0, 50) });
        return cached.response;
      }
    }

    return null;
  }

  /**
   * Cachea respuesta
   */
  cacheResponse(chatbotId, query, response) {
    const cacheKey = `${chatbotId}:${query}`;

    this.cache.set(cacheKey, {
      response,
      timestamp: Date.now()
    });

    // Limpiar cache si crece demasiado
    if (this.cache.size > 1000) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  /**
   * Valida cantidad de tokens
   */
  validateTokenCount(content, maxTokens = CONFIG.MAX_CONTEXT_TOKENS) {
    try {
      const tokens = enc.encode(content).length;

      if (tokens > maxTokens) {
        logger.warn('Token count exceeds limit', {
          tokens,
          limit: maxTokens,
          percentage: ((tokens / maxTokens) * 100).toFixed(1)
        });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error validating token count', { error: error.message });
      return true; // Permitir si hay error
    }
  }

  /**
   * Limpia cache periódicamente
   */
  cleanupCache() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > CONFIG.CACHE_TTL * 1000) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    for (const [key, value] of this.embeddingCache.entries()) {
      if (now - value.timestamp > CONFIG.CACHE_TTL * 1000) {
        this.embeddingCache.delete(key);
        cleaned++;
      }
    }

    logger.debug('Cache cleanup', {
      itemsCleaned: cleaned,
      cacheSize: this.cache.size + this.embeddingCache.size
    });
  }

  /**
   * Obtiene estadísticas de RAG
   */
  getStats() {
    return {
      cacheSize: this.cache.size,
      embeddingCacheSize: this.embeddingCache.size,
      config: CONFIG
    };
  }

  /**
   * Pipeline RAG completo y profesional (Phase 2+)
   * Integra búsqueda unificada, re-ranking, validación y citaciones
   * Con caching completo en Redis (Phase 4)
   */
  async generateAnswerWithRAG(query, chatbotId, workspaceId, openaiApiKey) {
    const startTime = Date.now();

    try {
      logger.info('[RAG:start]', { query, chatbotId });

      // 0. CHECK REDIS CACHE PARA RESPUESTA COMPLETA
      const cachedResponse = await RedisCache.getResponse(chatbotId, query);
      if (cachedResponse) {
        const latency = Date.now() - startTime;
        logger.info('[RAG:cache_hit]', {
          latencyMs: latency,
          query
        });
        return {
          ...cachedResponse,
          fromCache: true,
          cacheLatencyMs: latency
        };
      }

      // 1. BÚSQUEDA UNIFICADA: Documentos + Productos + Company Info
      const searchResults = await UnifiedSearchService.searchAll(
        query,
        chatbotId,
        workspaceId,
        openaiApiKey
      );

      logger.info('[RAG:search]', {
        totalResults: searchResults.totalResults,
        dataTypes: searchResults.dataTypes,
        latencyMs: searchResults.latencyMs
      });

      if (searchResults.results.length === 0) {
        logger.warn('[RAG:no_results]', { query });
        return {
          answer: 'No tengo información sobre eso. ¿Puedo ayudarte con algo más?',
          confidence: 0,
          citations: [],
          ragMetrics: {
            hasContext: false,
            totalLatencyMs: Date.now() - startTime
          }
        };
      }

      // 2. RE-RANKING AVANZADO
      const rankedResults = await RankingService.rerank(searchResults.results);
      const topResults = RankingService.topK(rankedResults, 5);

      logger.info('[RAG:rerank]', {
        totalResults: rankedResults.length,
        topScores: topResults.slice(0, 3).map(r => r.rankingScore.toFixed(2))
      });

      // 3. OBTENER INFORMACIÓN ADICIONAL DE EMPRESA
      const companyInfo = await CompanyInfo.findOne({ workspaceId });

      // 4. CONSTRUCCIÓN DE CONTEXTO
      const context = this.buildRAGContext(topResults, companyInfo);

      logger.info('[RAG:context]', {
        contextLength: context.length,
        tokenCount: enc.encode(context).length,
        additionalInfoCount: companyInfo?.additionalInfo?.length || 0
      });

      // 4. GENERACIÓN DE RESPUESTA CON LLM
      if (!openai) {
        openai = new OpenAI({ apiKey: openaiApiKey });
      }

      const systemPrompt = this.buildSystemPrompt(query, topResults);

      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: context + '\n\n---\n\nPregunta del usuario: ' + query
          }
        ],
        temperature: 0.3,
        max_tokens: 512,
        top_p: 0.9
      });

      const answer = completion.choices[0]?.message?.content || '';

      logger.info('[RAG:generation]', {
        answerLength: answer.length,
        tokens: completion.usage.total_tokens
      });

      // 5. VALIDACIÓN CONTRA HALLUCINATIONS
      const hallucination = await GuardrailsService.scoreHallucination(
        answer,
        topResults,
        companyInfo
      );

      if (hallucination.isSuspicious) {
        logger.warn('[RAG:hallucination_risk]', {
          riskScore: hallucination.overallRisk.toFixed(2)
        });
      }

      // 6. GENERACIÓN DE CITACIONES
      const cited = await CitationGeneratorService.addCitations(answer, topResults);

      logger.info('[RAG:citations]', {
        citationRate: cited.metadata?.citationRate,
        citedDocuments: cited.citedDocuments.length
      });

      const totalLatency = Date.now() - startTime;

      logger.info('[RAG:end]', {
        totalLatencyMs: totalLatency,
        confidence: (1 - hallucination.overallRisk).toFixed(2)
      });

      const response = {
        answer: cited.response,
        originalAnswer: answer,
        citations: cited.citations,
        citedDocuments: cited.citedDocuments,
        confidence: 1 - hallucination.overallRisk,
        ragMetrics: {
          hasContext: true,
          totalResults: searchResults.totalResults,
          topResultsUsed: topResults.length,
          hallucintationRisk: hallucination.overallRisk,
          citationRate: cited.metadata?.citationRate,
          totalLatencyMs: totalLatency,
          dataTypes: searchResults.dataTypes,
          fromCache: false
        }
      };

      // Cache respuesta completa en Redis (12 horas)
      await RedisCache.cacheResponse(chatbotId, query, response);

      return response;
    } catch (error) {
      logger.error('[RAG:error]', {
        error: error.message,
        query,
        chatbotId
      });

      return {
        answer: 'Disculpa, ocurrió un error procesando tu pregunta. Intenta nuevamente.',
        confidence: 0,
        citations: [],
        error: error.message,
        ragMetrics: {
          hasContext: false,
          totalLatencyMs: Date.now() - startTime,
          fromCache: false
        }
      };
    }
  }

  /**
   * Construye contexto formateado para el LLM
   */
  buildRAGContext(topResults, companyInfo) {
    let context = 'CONTEXTO BASADO EN INFORMACIÓN ACTUAL:\n===================================\n\n';

    // Agregar información adicional (preguntas/respuestas configuradas por el admin)
    if (companyInfo?.additionalInfo && companyInfo.additionalInfo.length > 0) {
      context += '📋 INFORMACIÓN ADICIONAL DEL ADMINISTRADOR:\n';
      for (const qa of companyInfo.additionalInfo) {
        if (qa.question && qa.answer) {
          context += `- P: ${qa.question}\n  R: ${qa.answer}\n`;
        }
      }
      context += '\n';
    }

    if (!topResults || topResults.length === 0) {
      return context;
    }

    for (const result of topResults) {
      if (result.type === 'document') {
        context += `📄 DOCUMENTO: ${result.source}\n`;
        context += `Contenido: ${result.text.substring(0, 300)}...\n`;
      } else if (result.type === 'product') {
        context += `🛍️ PRODUCTO: ${result.name}\n`;
        context += `Precio: $${result.price}\n`;
        context += `Descripción: ${result.description?.substring(0, 150)}...\n`;
      } else if (result.type === 'company') {
        context += `🏢 EMPRESA: ${result.company?.name}\n`;
        context += `Info: ${result.text.substring(0, 200)}...\n`;
      }
      context += `Relevancia: ${(result.similarity * 100).toFixed(0)}%\n\n`;
    }

    return context;
  }

  /**
   * Construye system prompt dinámico según el contexto
   */
  buildSystemPrompt(query, topResults) {
    const hasProducts = topResults.some(r => r.type === 'product');
    const hasCompanyInfo = topResults.some(r => r.type === 'company');
    const hasDocuments = topResults.some(r => r.type === 'document');

    let prompt = `Eres un asistente de atención al cliente profesional. Tu objetivo es responder preguntas de clientes basándote ÚNICAMENTE en la información proporcionada.

INSTRUCCIONES CRÍTICAS:
1. Responde SOLO con información del contexto. Si no encuentras la respuesta, di "No tengo información sobre eso"
2. Sé conciso y profesional. Máximo 2-3 oraciones.
3. Si se trata de precios o disponibilidad, cita la fuente.
4. NUNCA inventes números, fechas, precios o información no confirmada.
5. Usa la información de horarios, contacto, ubicación si está disponible.`;

    if (hasProducts) {
      prompt += '\n\nNOTA: Hay productos relacionados. Si el cliente pregunta sobre productos, menciona solo los relevantes.';
    }

    if (hasCompanyInfo) {
      prompt += '\n\nNOTA: Tienes información de la empresa (horarios, contacto, servicios). Usa esta información para responder preguntas operacionales.';
    }

    if (hasDocuments) {
      prompt += '\n\nNOTA: Hay documentos disponibles. Usa esta información para responder preguntas detalladas.';
    }

    return prompt;
  }

  /**
   * Pipeline RAG con soporte multilingüe (Phase 6)
   * Detecta idioma automáticamente y adapta la respuesta
   */
  async generateAnswerWithRAGMultilingual(query, chatbotId, workspaceId, openaiApiKey, userLanguage = null) {
    const startTime = Date.now();

    try {
      logger.info('[RAG-ML:start]', { query, userLanguage });

      // 1. Detectar idioma de la query
      const languageDetection = LanguageDetector.detectLanguage(query);
      const language = LanguageDetector.getLanguage(userLanguage, query);

      logger.info('[RAG-ML:language]', {
        detected: languageDetection.language,
        confidence: languageDetection.confidence,
        effective: language
      });

      // 2. Realizar búsqueda multilingüe
      const searchResults = await UnifiedSearchService.searchAllMultilingual(
        query,
        chatbotId,
        workspaceId,
        openaiApiKey,
        language
      );

      if (searchResults.results.length === 0) {
        logger.warn('[RAG-ML:no_results]', { query });
        const noInfoMessage = LanguageDetector.translateCommon('no_information', language);
        const tryAgainMessage = LanguageDetector.translateCommon('try_again', language);

        return {
          answer: `${noInfoMessage} ${tryAgainMessage}`,
          confidence: 0,
          citations: [],
          language,
          ragMetrics: {
            hasContext: false,
            totalLatencyMs: Date.now() - startTime
          }
        };
      }

      // 3. Re-ranking
      const rankedResults = await RankingService.rerank(searchResults.results);
      const topResults = RankingService.topK(rankedResults, 5);

      // 4. Obtener información adicional
      const companyInfo = await CompanyInfo.findOne({ workspaceId });

      // 5. Construir contexto
      const context = this.buildRAGContext(topResults, companyInfo);

      // 5. Generar respuesta con LLM (responde en el idioma detectado)
      if (!openai) {
        openai = new OpenAI({ apiKey: openaiApiKey });
      }

      const systemPrompt = this.buildMultilingualSystemPrompt(query, topResults, language);

      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: context + '\n\n---\n\nPregunta del usuario: ' + query
          }
        ],
        temperature: 0.3,
        max_tokens: 512,
        top_p: 0.9
      });

      const answer = completion.choices[0]?.message?.content || '';

      // 6. Validación contra hallucinations
      const hallucination = await GuardrailsService.scoreHallucination(
        answer,
        topResults,
        companyInfo
      );

      // 7. Agregar citaciones
      const cited = await CitationGeneratorService.addCitations(answer, topResults);

      const totalLatency = Date.now() - startTime;

      logger.info('[RAG-ML:end]', {
        language,
        totalLatencyMs: totalLatency,
        confidence: (1 - hallucination.overallRisk).toFixed(2)
      });

      return {
        answer: cited.response,
        originalAnswer: answer,
        citations: cited.citations,
        citedDocuments: cited.citedDocuments,
        confidence: 1 - hallucination.overallRisk,
        language,
        languageDetection,
        ragMetrics: {
          hasContext: true,
          totalResults: searchResults.totalResults,
          topResultsUsed: topResults.length,
          hallucintationRisk: hallucination.overallRisk,
          citationRate: cited.metadata?.citationRate,
          totalLatencyMs: totalLatency,
          dataTypes: searchResults.dataTypes,
          fromCache: searchResults.fromCache
        }
      };
    } catch (error) {
      logger.error('[RAG-ML:error]', {
        error: error.message,
        query
      });

      const errorMessage = LanguageDetector.translateCommon('error', userLanguage || 'es');

      return {
        answer: errorMessage,
        confidence: 0,
        citations: [],
        language: userLanguage || 'es',
        error: error.message,
        ragMetrics: {
          hasContext: false,
          totalLatencyMs: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Construye system prompt adaptado al idioma
   */
  buildMultilingualSystemPrompt(query, topResults, language) {
    const hasProducts = topResults.some(r => r.type === 'product');
    const hasCompanyInfo = topResults.some(r => r.type === 'company');
    const hasDocuments = topResults.some(r => r.type === 'document');

    const prompts = {
      es: `Eres un asistente de atención al cliente profesional. Tu objetivo es responder preguntas de clientes basándote ÚNICAMENTE en la información proporcionada.

INSTRUCCIONES CRÍTICAS:
1. Responde SOLO con información del contexto. Si no encuentras la respuesta, di "No tengo información sobre eso"
2. Sé conciso y profesional. Máximo 2-3 oraciones.
3. NUNCA inventes números, fechas, precios o información no confirmada.`,

      en: `You are a professional customer service assistant. Your goal is to answer customer questions based ONLY on the information provided.

CRITICAL INSTRUCTIONS:
1. Respond ONLY with information from the context. If you can't find the answer, say "I don't have information about that"
2. Be concise and professional. Maximum 2-3 sentences.
3. NEVER invent numbers, dates, prices or unconfirmed information.`,

      pt: `Você é um assistente de atendimento ao cliente profissional. Seu objetivo é responder perguntas dos clientes com base APENAS nas informações fornecidas.

INSTRUÇÕES CRÍTICAS:
1. Responda APENAS com informações do contexto. Se não encontrar a resposta, diga "Não tenho informações sobre isso"
2. Seja conciso e profissional. Máximo 2-3 frases.
3. NUNCA invente números, datas, preços ou informações não confirmadas.`,

      fr: `Vous êtes un assistant du service client professionnel. Votre objectif est de répondre aux questions des clients en vous basant UNIQUEMENT sur les informations fournies.

INSTRUCTIONS CRITIQUES:
1. Répondez UNIQUEMENT avec les informations du contexte. Si vous ne trouvez pas la réponse, dites "Je n'ai pas d'informations à ce sujet"
2. Soyez concis et professionnel. Maximum 2-3 phrases.
3. N'INVENTEZ JAMAIS de chiffres, dates, prix ou informations non confirmées.`,

      de: `Sie sind ein professioneller Kundenservicemitarbeiter. Ihr Ziel ist es, Kundenfragen nur auf der Grundlage der bereitgestellten Informationen zu beantworten.

KRITISCHE ANWEISUNGEN:
1. Antworten Sie NUR mit Informationen aus dem Kontext. Wenn Sie die Antwort nicht finden, sagen Sie "Ich habe keine Informationen dazu"
2. Seien Sie prägnant und professionell. Maximal 2-3 Sätze.
3. ERFINDEN Sie NIEMALS Zahlen, Daten, Preise oder unbestätigte Informationen.`
    };

    let prompt = prompts[language] || prompts['es'];

    if (hasProducts) {
      const note = language === 'en' ? '\n\nNOTE: There are related products.' :
                   language === 'pt' ? '\n\nNOTA: Há produtos relacionados.' :
                   language === 'fr' ? '\n\nREMARQUE: Il y a des produits connexes.' :
                   language === 'de' ? '\n\nHINWEIS: Es gibt verwandte Produkte.' :
                   '\n\nNOTA: Hay productos relacionados.';
      prompt += note;
    }

    if (hasCompanyInfo) {
      const note = language === 'en' ? '\n\nNOTE: You have company information.' :
                   language === 'pt' ? '\n\nNOTA: Você tem informações da empresa.' :
                   language === 'fr' ? '\n\nREMARQUE: Vous disposez d\'informations sur l\'entreprise.' :
                   language === 'de' ? '\n\nHINWEIS: Sie haben Unternehmensinformationen.' :
                   '\n\nNOTA: Tienes información de la empresa.';
      prompt += note;
    }

    if (hasDocuments) {
      const note = language === 'en' ? '\n\nNOTE: Documents are available.' :
                   language === 'pt' ? '\n\nNOTA: Documentos estão disponíveis.' :
                   language === 'fr' ? '\n\nREMARQUE: Des documents sont disponibles.' :
                   language === 'de' ? '\n\nHINWEIS: Dokumente sind verfügbar.' :
                   '\n\nNOTA: Hay documentos disponibles.';
      prompt += note;
    }

    return prompt;
  }
}
