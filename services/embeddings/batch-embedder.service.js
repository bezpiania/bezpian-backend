import OpenAI from 'openai';
import logger from '../../utils/logger.js';

class BatchEmbedderService {
  constructor() {
    this.modelName = 'text-embedding-3-small';
    this.embeddingDimension = 1536;
    this.maxBatchSize = 100; // OpenAI batch limit
  }

  /**
   * Deduplica textos para evitar embeddings duplicados
   * Devuelve { deduped: [text], mapping: {hash -> original indices} }
   */
  deduplicateTexts(texts) {
    const mapping = new Map();
    const deduped = [];
    const seen = new Set();

    texts.forEach((text, idx) => {
      const hash = this.hashText(text);

      if (!seen.has(hash)) {
        seen.add(hash);
        deduped.push(text);
        mapping.set(hash, []);
      }

      mapping.get(hash).push(idx);
    });

    return { deduped, mapping };
  }

  /**
   * Hash simple de texto
   */
  hashText(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString();
  }

  /**
   * Divide array en chunks de tamaño máximo
   */
  chunksArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Genera embeddings para múltiples textos usando batch processing
   * Deduplica textos para optimizar costo
   * Devuelve embeddings en el mismo orden que la entrada
   */
  async generateBatchEmbeddings(texts, openaiApiKey) {
    try {
      if (!openaiApiKey || !texts || texts.length === 0) {
        return [];
      }

      // Deduplicar textos
      const { deduped, mapping } = this.deduplicateTexts(texts);

      logger.info('Starting batch embedding generation', {
        originalCount: texts.length,
        dedupedCount: deduped.length,
        duplicateSaved: texts.length - deduped.length
      });

      const client = new OpenAI({ apiKey: openaiApiKey });

      // Procesar en chunks si es necesario
      const chunks = this.chunksArray(deduped, this.maxBatchSize);
      const allEmbeddings = [];

      for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
        const chunk = chunks[chunkIdx];

        const response = await client.embeddings.create({
          model: this.modelName,
          input: chunk,
          encoding_format: 'float',
          dimensions: this.embeddingDimension
        });

        if (!response.data || response.data.length === 0) {
          logger.error('No embedding data in batch response', {
            chunkIdx,
            chunkSize: chunk.length
          });
          continue;
        }

        allEmbeddings.push(...response.data.map(d => d.embedding));

        logger.info('Batch chunk processed', {
          chunkIdx,
          chunkSize: chunk.length,
          totalProcessed: allEmbeddings.length
        });
      }

      // Mapear embeddings de dedup de vuelta al orden original
      const result = new Array(texts.length);

      let dedupIdx = 0;
      for (const [hash, indices] of mapping.entries()) {
        const embedding = allEmbeddings[dedupIdx];
        indices.forEach(idx => {
          result[idx] = embedding;
        });
        dedupIdx++;
      }

      logger.info('Batch embeddings completed', {
        totalCount: result.length,
        costOptimization: Math.round(((texts.length - deduped.length) / texts.length) * 100) + '%'
      });

      return result;
    } catch (error) {
      logger.error('Error in batch embedding generation', {
        error: error.message,
        textsCount: texts?.length
      });
      return [];
    }
  }

  /**
   * Genera embedding para un solo texto (fallback si necesitas uno)
   */
  async generateSingleEmbedding(text, openaiApiKey) {
    try {
      if (!openaiApiKey || !text) {
        return null;
      }

      const client = new OpenAI({ apiKey: openaiApiKey });

      const response = await client.embeddings.create({
        model: this.modelName,
        input: text,
        encoding_format: 'float',
        dimensions: this.embeddingDimension
      });

      if (!response.data || response.data.length === 0) {
        return null;
      }

      return response.data[0].embedding;
    } catch (error) {
      logger.error('Error generating single embedding', {
        error: error.message,
        textLength: text?.length
      });
      return null;
    }
  }
}

export default new BatchEmbedderService();
