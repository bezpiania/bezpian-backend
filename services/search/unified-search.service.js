import { OpenAI } from 'openai';
import DocumentChunk from '../../models/DocumentChunk.js';
import Product from '../../models/Product.js';
import CompanyInfo from '../../models/CompanyInfo.js';
import logger from '../../utils/logger.js';
import RedisCache from '../../services/cache/redis-cache.service.js';
import LanguageDetector from '../language/language-detector.service.js';

class UnifiedSearchService {
  constructor() {
    this.modelName = 'text-embedding-3-small';
    this.embeddingDimension = 1536;
    this.similarityThreshold = 0.70; // 70% similarity minimum
    this.cache = new Map();
  }

  /**
   * Genera embedding de query usando OpenAI (con caching en Redis)
   */
  async generateQueryEmbedding(query, openaiApiKey) {
    try {
      if (!openaiApiKey || !query) {
        return null;
      }

      // 1. Check Redis cache first
      const cachedEmbedding = await RedisCache.getQueryEmbedding(query);
      if (cachedEmbedding) {
        logger.debug('Query embedding from Redis cache', { query });
        return cachedEmbedding;
      }

      // 2. Check in-memory cache
      const cacheKey = `query:${query}`;
      if (this.cache.has(cacheKey)) {
        logger.debug('Query embedding from memory cache', { query });
        return this.cache.get(cacheKey);
      }

      // 3. Generate from OpenAI
      const client = new OpenAI({ apiKey: openaiApiKey });

      const response = await client.embeddings.create({
        model: this.modelName,
        input: query,
        encoding_format: 'float',
        dimensions: this.embeddingDimension
      });

      if (!response.data || response.data.length === 0) {
        logger.error('No embedding data from OpenAI for query', { query });
        return null;
      }

      const embedding = response.data[0].embedding;

      // 4. Cache in both Redis and memory
      await RedisCache.cacheQueryEmbedding(query, embedding);
      this.cache.set(cacheKey, embedding);
      setTimeout(() => this.cache.delete(cacheKey), 3600000); // 1 hour memory cache

      logger.info('Query embedding generated and cached', { query, source: 'OpenAI' });
      return embedding;
    } catch (error) {
      logger.error('Error generating query embedding', {
        error: error.message,
        query
      });
      return null;
    }
  }

  /**
   * Busca documentos usando vector search
   */
  async searchDocuments(queryEmbedding, chatbotId, limit = 3) {
    try {
      if (!queryEmbedding || !chatbotId) {
        return [];
      }

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
            chatbotId: chatbotId,
            embedding: { $exists: true, $ne: [] }
          }
        },
        {
          $project: {
            text: 1,
            metadata: 1,
            documentId: 1,
            similarity: { $meta: 'searchScore' }
          }
        },
        {
          $limit: limit
        }
      ]);

      // Filter by threshold
      const filtered = chunks.filter(c => c.similarity >= this.similarityThreshold);

      logger.info('Documents search completed', {
        chatbotId,
        resultsFound: chunks.length,
        resultsFiltered: filtered.length,
        threshold: this.similarityThreshold
      });

      return filtered.map(c => ({
        type: 'document',
        text: c.text,
        metadata: c.metadata,
        documentId: c.documentId,
        similarity: c.similarity,
        source: `${c.metadata?.sourceFile || 'Document'}${c.metadata?.pageNumber ? ` (Página ${c.metadata.pageNumber})` : ''}`
      }));
    } catch (error) {
      logger.error('Error searching documents', {
        error: error.message,
        chatbotId
      });
      return [];
    }
  }

  /**
   * Busca productos usando vector search
   */
  async searchProducts(queryEmbedding, chatbotId, limit = 2) {
    try {
      if (!queryEmbedding || !chatbotId) {
        return [];
      }

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
            chatbotId: chatbotId,
            embedding: { $exists: true, $ne: [] }
          }
        },
        {
          $project: {
            name: 1,
            description: 1,
            price: 1,
            category: 1,
            similarity: { $meta: 'searchScore' }
          }
        },
        {
          $limit: limit
        }
      ]);

      // Filter by threshold
      const filtered = products.filter(p => p.similarity >= this.similarityThreshold);

      logger.info('Products search completed', {
        chatbotId,
        resultsFound: products.length,
        resultsFiltered: filtered.length,
        threshold: this.similarityThreshold
      });

      return filtered.map(p => ({
        type: 'product',
        name: p.name,
        description: p.description,
        price: p.price,
        category: p.category,
        similarity: p.similarity,
        source: `Producto: ${p.name}${p.category ? ` (${p.category})` : ''}`
      }));
    } catch (error) {
      logger.error('Error searching products', {
        error: error.message,
        chatbotId
      });
      return [];
    }
  }

  /**
   * Busca información de empresa usando vector search
   */
  async searchCompanyInfo(queryEmbedding, workspaceId, limit = 1) {
    try {
      if (!queryEmbedding || !workspaceId) {
        return [];
      }

      const companyInfo = await CompanyInfo.aggregate([
        {
          $match: {
            workspaceId: workspaceId,
            embedding: { $exists: true, $ne: [] }
          }
        },
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
          $project: {
            company: 1,
            hours: 1,
            dispatches: 1,
            payments: 1,
            social: 1,
            embeddingText: 1,
            similarity: { $meta: 'searchScore' }
          }
        },
        {
          $limit: limit
        }
      ]);

      // Filter by threshold
      const filtered = companyInfo.filter(c => c.similarity >= this.similarityThreshold);

      logger.info('Company info search completed', {
        workspaceId,
        resultsFound: companyInfo.length,
        resultsFiltered: filtered.length,
        threshold: this.similarityThreshold
      });

      return filtered.map(c => ({
        type: 'company',
        text: c.embeddingText,
        company: c.company,
        hours: c.hours,
        dispatches: c.dispatches,
        payments: c.payments,
        social: c.social,
        similarity: c.similarity,
        source: `Información de ${c.company?.name || 'empresa'}`
      }));
    } catch (error) {
      logger.error('Error searching company info', {
        error: error.message,
        workspaceId
      });
      return [];
    }
  }

  /**
   * Búsqueda unificada en TODOS los tipos de datos (con caching en Redis)
   * Ejecuta búsquedas en paralelo y mergea resultados
   */
  async searchAll(query, chatbotId, workspaceId, openaiApiKey) {
    try {
      const startTime = Date.now();

      // 1. Check Redis cache for complete search results
      const cachedResults = await RedisCache.getSearchResults(chatbotId, query);
      if (cachedResults) {
        logger.info('Search results from Redis cache', {
          query,
          totalResults: cachedResults.length,
          latencyMs: Date.now() - startTime
        });
        return {
          results: cachedResults,
          totalResults: cachedResults.length,
          latencyMs: Date.now() - startTime,
          dataTypes: {
            documents: cachedResults.filter(r => r.type === 'document').length,
            products: cachedResults.filter(r => r.type === 'product').length,
            company: cachedResults.filter(r => r.type === 'company').length
          },
          fromCache: true
        };
      }

      // 2. Generar embedding de query
      const queryEmbedding = await this.generateQueryEmbedding(query, openaiApiKey);
      if (!queryEmbedding) {
        logger.warn('Could not generate query embedding, returning empty results', { query });
        return {
          results: [],
          totalResults: 0,
          latencyMs: Date.now() - startTime,
          dataTypes: { documents: 0, products: 0, company: 0 }
        };
      }

      // 3. Buscar en paralelo en todos los tipos
      const [documents, products, company] = await Promise.all([
        this.searchDocuments(queryEmbedding, chatbotId, 3),
        this.searchProducts(queryEmbedding, chatbotId, 2),
        this.searchCompanyInfo(queryEmbedding, workspaceId, 1)
      ]);

      // 4. Mergear resultados
      const allResults = [...documents, ...products, ...company];

      // 5. Ordenar por similitud (descendente)
      allResults.sort((a, b) => b.similarity - a.similarity);

      const latency = Date.now() - startTime;

      // 6. Cache results in Redis
      await RedisCache.cacheSearchResults(chatbotId, query, allResults);

      logger.info('Unified search completed', {
        query,
        totalResults: allResults.length,
        dataTypes: {
          documents: documents.length,
          products: products.length,
          company: company.length
        },
        latencyMs: latency,
        fromCache: false
      });

      return {
        results: allResults,
        totalResults: allResults.length,
        latencyMs: latency,
        dataTypes: {
          documents: documents.length,
          products: products.length,
          company: company.length
        },
        fromCache: false
      };
    } catch (error) {
      logger.error('Error in unified search', {
        error: error.message,
        query,
        chatbotId
      });
      return {
        results: [],
        totalResults: 0,
        latencyMs: 0,
        error: error.message,
        dataTypes: { documents: 0, products: 0, company: 0 }
      };
    }
  }

  /**
   * Limpia el cache de embeddings
   */
  clearCache() {
    this.cache.clear();
    logger.info('Embedding cache cleared');
  }

  /**
   * Búsqueda multilingüe: detecta idioma y usa el mismo para búsqueda
   * Soporta: es, en, pt, fr, de
   */
  async searchAllMultilingual(query, chatbotId, workspaceId, openaiApiKey, userLanguage = null) {
    try {
      // 1. Detectar idioma de la query
      const languageDetection = LanguageDetector.detectLanguage(query);
      const language = LanguageDetector.getLanguage(userLanguage, query);

      logger.info('[Multilingual:detect]', {
        detectedLanguage: languageDetection.language,
        confidence: languageDetection.confidence,
        effectiveLanguage: language
      });

      // 2. Realizar búsqueda normal (embeddings funcionan en todos los idiomas)
      const searchResults = await this.searchAll(query, chatbotId, workspaceId, openaiApiKey);

      // 3. Agregar información de idioma a los resultados
      const resultsWithLanguage = {
        ...searchResults,
        language,
        languageDetection,
        languageName: LanguageDetector.languagePatterns[language]?.name || 'Unknown'
      };

      logger.info('[Multilingual:search_complete]', {
        language,
        totalResults: searchResults.totalResults
      });

      return resultsWithLanguage;
    } catch (error) {
      logger.error('Error in multilingual search', {
        error: error.message,
        query
      });
      return {
        results: [],
        totalResults: 0,
        language: 'es',
        languageDetection: { language: 'es', confidence: 0 },
        error: error.message,
        dataTypes: { documents: 0, products: 0, company: 0 }
      };
    }
  }
}

export default new UnifiedSearchService();
