import Chatbot from '../../models/Chatbot.js';
import Document from '../../models/Document.js';
import Product from '../../models/Product.js';
import productEmbeddingService from '../embeddings/product-embedding.service.js';
import documentEmbeddingService from '../embeddings/document-embedding.service.js';
import logger from '../../utils/logger.js';

class AdminService {

    generateEmbeddings = async (chatbotId) => {
        try {
            const bot = await Chatbot.findById(chatbotId);
            if (!bot) return { success: false, message: 'Chatbot no encontrado' };
            if (!bot.openaiApiKey) return { success: false, message: 'API key de OpenAI no configurada' };

            const apiKey = bot.openaiApiKey;
            let docsEmbedded = 0;
            let prodsEmbedded = 0;
            const errors = [];

            // Embed documents
            const docs = await Document.find({ chatbotId });
            for (const doc of docs) {
                try {
                    await documentEmbeddingService.generateEmbedding(doc, apiKey);
                    docsEmbedded++;
                } catch (err) {
                    errors.push(`Doc ${doc._id}: ${err.message}`);
                    logger.error('Error embedding document', { docId: doc._id, error: err.message });
                }
            }

            // Embed products
            const products = await Product.find({ chatbotId });
            for (const prod of products) {
                try {
                    await productEmbeddingService.generateEmbedding(prod, apiKey);
                    prodsEmbedded++;
                } catch (err) {
                    errors.push(`Prod ${prod._id}: ${err.message}`);
                    logger.error('Error embedding product', { prodId: prod._id, error: err.message });
                }
            }

            return {
                success: true,
                message: `Embeddings generados: ${docsEmbedded} docs, ${prodsEmbedded} productos`,
                data: { docsEmbedded, prodsEmbedded, errors: errors.length ? errors : undefined },
            };
        } catch (error) {
            logger.error('AdminService.generateEmbeddings error', { error: error.message });
            return { success: false, message: error.message };
        }
    };
}

export default new AdminService();
