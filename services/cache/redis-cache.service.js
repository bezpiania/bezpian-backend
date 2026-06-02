import Redis from 'ioredis';
import logger from '../../utils/logger.js';

class RedisCacheService {
  constructor(redisUrl = process.env.REDIS_URL) {
    this.connected = false;
    this.redis = null;

    if (redisUrl) {
      try {
        this.redis = new Redis(redisUrl);

        this.redis.on('connect', () => {
          this.connected = true;
          logger.info('✅ Redis connected');
        });

        this.redis.on('error', (err) => {
          logger.error('❌ Redis error', { error: err.message });
          this.connected = false;
        });

        this.redis.on('close', () => {
          this.connected = false;
          logger.warn('⚠️ Redis disconnected');
        });
      } catch (error) {
        logger.error('Failed to initialize Redis', { error: error.message });
        this.redis = null;
      }
    }
  }

  /**
   * Cache para embeddings de query (24 horas)
   * Key: rag:embedding:query:{hash(query)}
   */
  async cacheQueryEmbedding(query, embedding) {
    if (!this.connected) return null;

    try {
      const key = `rag:embedding:query:${this.hash(query)}`;
      const ttl = 86400; // 24 horas

      await this.redis.setex(
        key,
        ttl,
        JSON.stringify(embedding)
      );

      logger.debug('Query embedding cached', { key: key.substring(0, 50) });
      return key;
    } catch (error) {
      logger.warn('Error caching query embedding', { error: error.message });
      return null;
    }
  }

  /**
   * Obtiene embedding de query del cache
   */
  async getQueryEmbedding(query) {
    if (!this.connected) return null;

    try {
      const key = `rag:embedding:query:${this.hash(query)}`;
      const cached = await this.redis.get(key);

      if (cached) {
        logger.debug('Query embedding from cache', { key: key.substring(0, 50) });
        return JSON.parse(cached);
      }

      return null;
    } catch (error) {
      logger.warn('Error retrieving query embedding', { error: error.message });
      return null;
    }
  }

  /**
   * Cache para resultados de búsqueda (1 hora)
   * Key: rag:search:{chatbotId}:{hash(query)}
   */
  async cacheSearchResults(chatbotId, query, results) {
    if (!this.connected) return null;

    try {
      const key = `rag:search:${chatbotId}:${this.hash(query)}`;
      const ttl = 3600; // 1 hora (datos cambian lentamente)

      await this.redis.setex(
        key,
        ttl,
        JSON.stringify(results)
      );

      logger.debug('Search results cached', {
        key: key.substring(0, 50),
        resultsCount: results.length
      });
      return key;
    } catch (error) {
      logger.warn('Error caching search results', { error: error.message });
      return null;
    }
  }

  /**
   * Obtiene resultados de búsqueda del cache
   */
  async getSearchResults(chatbotId, query) {
    if (!this.connected) return null;

    try {
      const key = `rag:search:${chatbotId}:${this.hash(query)}`;
      const cached = await this.redis.get(key);

      if (cached) {
        logger.debug('Search results from cache', { key: key.substring(0, 50) });
        return JSON.parse(cached);
      }

      return null;
    } catch (error) {
      logger.warn('Error retrieving search results', { error: error.message });
      return null;
    }
  }

  /**
   * Cache para respuestas completas (12 horas)
   * Key: rag:response:{chatbotId}:{hash(query)}
   */
  async cacheResponse(chatbotId, query, response) {
    if (!this.connected) return null;

    try {
      const key = `rag:response:${chatbotId}:${this.hash(query)}`;
      const ttl = 43200; // 12 horas

      await this.redis.setex(
        key,
        ttl,
        JSON.stringify(response)
      );

      logger.debug('Response cached', {
        key: key.substring(0, 50),
        responseLength: response.answer?.length
      });
      return key;
    } catch (error) {
      logger.warn('Error caching response', { error: error.message });
      return null;
    }
  }

  /**
   * Obtiene respuesta del cache
   */
  async getResponse(chatbotId, query) {
    if (!this.connected) return null;

    try {
      const key = `rag:response:${chatbotId}:${this.hash(query)}`;
      const cached = await this.redis.get(key);

      if (cached) {
        logger.debug('Response from cache', { key: key.substring(0, 50) });
        return JSON.parse(cached);
      }

      return null;
    } catch (error) {
      logger.warn('Error retrieving response', { error: error.message });
      return null;
    }
  }

  /**
   * Cache para embeddings de documentos/productos (7 días)
   * Key: rag:embedding:{type}:{hash(text)}:{model}
   */
  async cacheEmbedding(text, embedding, type = 'document', model = 'text-embedding-3-small') {
    if (!this.connected) return null;

    try {
      const key = `rag:embedding:${type}:${this.hash(text)}:${model}`;
      const ttl = 604800; // 7 días (embeddings no cambian)

      await this.redis.setex(
        key,
        ttl,
        JSON.stringify(embedding)
      );

      logger.debug('Embedding cached', {
        key: key.substring(0, 50),
        type,
        textLength: text.length
      });
      return key;
    } catch (error) {
      logger.warn('Error caching embedding', { error: error.message });
      return null;
    }
  }

  /**
   * Obtiene embedding del cache
   */
  async getEmbedding(text, type = 'document', model = 'text-embedding-3-small') {
    if (!this.connected) return null;

    try {
      const key = `rag:embedding:${type}:${this.hash(text)}:${model}`;
      const cached = await this.redis.get(key);

      if (cached) {
        logger.debug('Embedding from cache', { key: key.substring(0, 50) });
        return JSON.parse(cached);
      }

      return null;
    } catch (error) {
      logger.warn('Error retrieving embedding', { error: error.message });
      return null;
    }
  }

  /**
   * Cache para batch de embeddings (7 días)
   * Key: rag:embeddings:batch:{hash(texts)}
   */
  async cacheBatchEmbeddings(texts, embeddings, type = 'document') {
    if (!this.connected) return null;

    try {
      const key = `rag:embeddings:batch:${type}:${this.hash(texts.join('|'))}`;
      const ttl = 604800; // 7 días

      const batch = texts.reduce((acc, text, idx) => {
        acc[this.hash(text)] = embeddings[idx];
        return acc;
      }, {});

      await this.redis.setex(
        key,
        ttl,
        JSON.stringify(batch)
      );

      logger.debug('Batch embeddings cached', {
        key: key.substring(0, 50),
        count: texts.length,
        type
      });
      return key;
    } catch (error) {
      logger.warn('Error caching batch embeddings', { error: error.message });
      return null;
    }
  }

  /**
   * Obtiene embedding individual de batch cache
   */
  async getEmbeddingFromBatch(text, type = 'document') {
    if (!this.connected) return null;

    try {
      // Buscar en redis usando patrón
      const pattern = `rag:embeddings:batch:${type}:*`;
      const keys = await this.redis.keys(pattern);

      for (const key of keys) {
        const batch = await this.redis.get(key);
        if (batch) {
          const parsed = JSON.parse(batch);
          const embedding = parsed[this.hash(text)];
          if (embedding) {
            logger.debug('Embedding from batch cache', { key: key.substring(0, 50) });
            return embedding;
          }
        }
      }

      return null;
    } catch (error) {
      logger.warn('Error retrieving embedding from batch', { error: error.message });
      return null;
    }
  }

  /**
   * Cache para metadata de conversaciones
   * Key: rag:conversation:{conversationId}
   */
  async cacheConversation(conversationId, conversation) {
    if (!this.connected) return null;

    try {
      const key = `rag:conversation:${conversationId}`;
      const ttl = 86400 * 7; // 7 días

      await this.redis.setex(
        key,
        ttl,
        JSON.stringify(conversation)
      );

      logger.debug('Conversation cached', { conversationId });
      return key;
    } catch (error) {
      logger.warn('Error caching conversation', { error: error.message });
      return null;
    }
  }

  /**
   * Obtiene conversación del cache
   */
  async getConversation(conversationId) {
    if (!this.connected) return null;

    try {
      const key = `rag:conversation:${conversationId}`;
      const cached = await this.redis.get(key);

      if (cached) {
        logger.debug('Conversation from cache', { conversationId });
        return JSON.parse(cached);
      }

      return null;
    } catch (error) {
      logger.warn('Error retrieving conversation', { error: error.message });
      return null;
    }
  }

  /**
   * Invalida cache por patrón
   * Ej: invalidate('rag:search:chatbotId123:*') limpia todas las búsquedas de ese chatbot
   */
  async invalidate(pattern) {
    if (!this.connected) return 0;

    try {
      const keys = await this.redis.keys(pattern);

      if (keys.length === 0) {
        return 0;
      }

      const deleted = await this.redis.del(...keys);

      logger.info('Cache invalidated', {
        pattern,
        keysDeleted: deleted
      });

      return deleted;
    } catch (error) {
      logger.warn('Error invalidating cache', {
        error: error.message,
        pattern
      });
      return 0;
    }
  }

  /**
   * Limpia todo el cache RAG
   */
  async clearAll() {
    if (!this.connected) return 0;

    try {
      const keys = await this.redis.keys('rag:*');

      if (keys.length === 0) {
        return 0;
      }

      const deleted = await this.redis.del(...keys);

      logger.info('All RAG cache cleared', { keysDeleted: deleted });

      return deleted;
    } catch (error) {
      logger.warn('Error clearing cache', { error: error.message });
      return 0;
    }
  }

  /**
   * Obtiene estadísticas de cache
   */
  async getStats() {
    if (!this.connected) {
      return {
        connected: false,
        error: 'Redis not connected'
      };
    }

    try {
      const info = await this.redis.info('memory');
      const keys = await this.redis.keys('rag:*');

      // Contar keys por tipo
      const stats = {
        connected: true,
        totalKeys: keys.length,
        memoryUsage: info.match(/used_memory_human:([^\r\n]+)/)?.[1] || 'unknown',
        keysByType: {
          queries: keys.filter(k => k.includes(':query:')).length,
          searches: keys.filter(k => k.includes(':search:')).length,
          responses: keys.filter(k => k.includes(':response:')).length,
          embeddings: keys.filter(k => k.includes(':embedding:')).length,
          conversations: keys.filter(k => k.includes(':conversation:')).length
        }
      };

      logger.debug('Cache stats retrieved', stats);
      return stats;
    } catch (error) {
      logger.warn('Error getting cache stats', { error: error.message });
      return {
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * Hash simple para keys
   */
  hash(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Desconecta Redis
   */
  disconnect() {
    if (this.redis) {
      this.redis.disconnect();
      this.connected = false;
      logger.info('Redis disconnected');
    }
  }
}

export default new RedisCacheService(process.env.REDIS_URL);
