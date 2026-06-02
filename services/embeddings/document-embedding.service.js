import OpenAI from 'openai';
import logger from '../../utils/logger.js';

class DocumentEmbeddingService {
  constructor() {
    this.modelName = 'text-embedding-3-small';
    this.embeddingDimension = 1536;
  }

  /**
   * Construye texto optimizado para embedding de un chunk de documento
   * Incluye el contenido principal + metadatos contextuales
   */
  buildEmbeddingText(chunk) {
    const parts = [
      chunk.text,
      chunk.metadata?.sourceFile ? `Fuente: ${chunk.metadata.sourceFile}` : '',
      chunk.metadata?.pageNumber ? `Página: ${chunk.metadata.pageNumber}` : ''
    ].filter(Boolean);

    return parts.join('. ').substring(0, 500);
  }

  /**
   * Genera embedding para un chunk de documento
   */
  async generateEmbedding(chunk, openaiApiKey) {
    try {
      if (!openaiApiKey) {
        logger.warn('OpenAI API key not provided for document embedding', {
          chunkId: chunk._id,
          documentId: chunk.documentId
        });
        return null;
      }

      const embeddingText = this.buildEmbeddingText(chunk);

      const client = new OpenAI({ apiKey: openaiApiKey });

      const response = await client.embeddings.create({
        model: this.modelName,
        input: embeddingText,
        encoding_format: 'float',
        dimensions: this.embeddingDimension
      });

      if (!response.data || response.data.length === 0) {
        logger.error('No embedding data returned from OpenAI', {
          chunkId: chunk._id,
          documentId: chunk.documentId
        });
        return null;
      }

      logger.info('Document chunk embedding generated', {
        chunkId: chunk._id,
        documentId: chunk.documentId,
        textLength: embeddingText.length
      });

      return {
        embedding: response.data[0].embedding,
        embeddingText,
        embeddingModel: this.modelName
      };
    } catch (error) {
      logger.error('Error generating document embedding', {
        error: error.message,
        chunkId: chunk._id,
        documentId: chunk.documentId
      });
      return null;
    }
  }

  /**
   * Genera embeddings para múltiples chunks en batch
   */
  async generateEmbeddingsBatch(chunks, openaiApiKey) {
    try {
      if (!openaiApiKey || !chunks || chunks.length === 0) {
        return [];
      }

      const client = new OpenAI({ apiKey: openaiApiKey });

      const embeddingTexts = chunks.map(c => this.buildEmbeddingText(c));

      const response = await client.embeddings.create({
        model: this.modelName,
        input: embeddingTexts,
        encoding_format: 'float',
        dimensions: this.embeddingDimension
      });

      const result = response.data.map((data, idx) => ({
        chunkId: chunks[idx]._id,
        documentId: chunks[idx].documentId,
        embedding: data.embedding,
        embeddingText: embeddingTexts[idx],
        embeddingModel: this.modelName
      }));

      logger.info('Batch document embeddings generated', {
        count: result.length
      });

      return result;
    } catch (error) {
      logger.error('Error generating batch document embeddings', {
        error: error.message,
        chunksCount: chunks?.length
      });
      return [];
    }
  }
}

export default new DocumentEmbeddingService();
