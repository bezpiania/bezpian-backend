import Document from '../../models/Document.js';
import DocumentChunk from '../../models/DocumentChunk.js';

class RAGService {
  /**
   * Busca chunks relevantes para una query
   */
  async searchDocuments(chatbotId, query, limit = 3) {
    try {
      if (!query || query.trim().length === 0) {
        return [];
      }

      // Buscar chunks que coincidan con la query
      const chunks = await DocumentChunk.find({
        chatbotId,
        $text: { $search: query }
      })
        .limit(limit * 3)
        .lean();

      // Si text search no funciona, hacer búsqueda simple por keywords
      if (chunks.length === 0) {
        const queryTerms = query.toLowerCase().split(/\s+/);
        const allChunks = await DocumentChunk.find({ chatbotId }).lean();

        const scoredChunks = allChunks
          .map(chunk => {
            let score = 0;
            const chunkText = chunk.text.toLowerCase();

            queryTerms.forEach(term => {
              try {
                const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const matches = (chunkText.match(new RegExp(safeTerm, 'g')) || []).length;
                score += matches;
              } catch(e) { /* skip invalid term */ }
            });

            return {
              ...chunk,
              relevance: score
            };
          })
          .filter(chunk => chunk.relevance > 0)
          .sort((a, b) => b.relevance - a.relevance)
          .slice(0, limit);

        return scoredChunks.map(chunk => ({
          chunkId: chunk._id,
          documentId: chunk.documentId,
          content: chunk.text,
          relevance: chunk.relevance,
          tokenCount: chunk.tokenCount
        }));
      }

      return chunks.map(chunk => ({
        chunkId: chunk._id,
        documentId: chunk.documentId,
        content: chunk.text,
        relevance: 1,
        tokenCount: chunk.tokenCount
      }));
    } catch (error) {
      console.error('Error searching documents:', error);
      return [];
    }
  }

  /**
   * Obtiene productos relevantes para una query
   */
  async searchProducts(chatbotId, query, limit = 5) {
    try {
      // Por ahora retornamos array vacío
      // Esto se implementaría integrando con el catálogo de productos
      // cuando esté disponible la API de productos

      return [];
    } catch (error) {
      console.error('Error searching products:', error);
      return [];
    }
  }

  /**
   * Construye el contexto final para el prompt
   */
  buildContext(docs, products, customPrompt) {
    let context = '';

    if (customPrompt) {
      context += `Instrucciones especiales:\n${customPrompt}\n\n`;
    }

    if (docs && docs.length > 0) {
      context += 'Información relevante:\n';
      docs.forEach((doc, idx) => {
        context += `- ${doc.filename}: ${doc.content || 'Documento cargado'}\n`;
      });
      context += '\n';
    }

    if (products && products.length > 0) {
      context += 'Productos disponibles:\n';
      products.forEach(product => {
        context += `- ${product.name} ($${product.price}): ${product.description}\n`;
      });
      context += '\n';
    }

    return context || 'Asistente de chatbot disponible';
  }
}

export default new RAGService();
