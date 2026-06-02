import { Quote } from '../../models/index.js';
import crypto from 'crypto';
import logger from '../../utils/logger.js';

class QuoteService {
    create = async (workspaceId, chatbotId, quoteData) => {
        try {
            const { items, customerData, conversationId, leadId } = quoteData;

            if (!items || items.length === 0) {
                return { success: false, message: 'Items no puede estar vacío' };
            }

            // Calcular totales
            let subtotal = 0;
            items.forEach(item => {
                const itemSubtotal = item.quantity * item.unitPrice;
                subtotal += itemSubtotal;
            });

            // Generar número único
            const quoteNumber = `QT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

            const quote = await Quote.create({
                chatbotId,
                workspaceId,
                conversationId,
                leadId,
                quoteNumber,
                items,
                subtotal,
                tax: 0,
                total: subtotal,
                currency: 'CLP',
                customerData,
                status: 'draft',
                shareToken: crypto.randomBytes(16).toString('hex'),
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            });

            logger.info(`✅ Quote created:`, { quoteId: quote._id, quoteNumber });
            return { success: true, message: 'Cotización creada', data: quote };
        } catch (error) {
            logger.error('❌ QuoteService.create:', error);
            return { success: false, message: error.message };
        }
    };

    list = async (workspaceId, filters = {}) => {
        try {
            let query = { workspaceId };
            if (filters.status) query.status = filters.status;

            const quotes = await Quote.find(query).sort({ createdAt: -1 });
            return { success: true, message: 'Cotizaciones obtenidas', data: quotes };
        } catch (error) {
            console.error('❌ QuoteService.list:', error);
            return { success: false, message: error.message };
        }
    };

    get = async (quoteId) => {
        try {
            const quote = await Quote.findById(quoteId);
            if (!quote) return { success: false, message: 'Cotización no encontrada' };
            return { success: true, message: 'Cotización obtenida', data: quote };
        } catch (error) {
            console.error('❌ QuoteService.get:', error);
            return { success: false, message: error.message };
        }
    };

    update = async (quoteId, updates) => {
        try {
            const quote = await Quote.findByIdAndUpdate(quoteId, updates, { new: true });
            return { success: true, message: 'Cotización actualizada', data: quote };
        } catch (error) {
            console.error('❌ QuoteService.update:', error);
            return { success: false, message: error.message };
        }
    };

    delete = async (quoteId) => {
        try {
            await Quote.deleteOne({ _id: quoteId });
            return { success: true, message: 'Cotización eliminada' };
        } catch (error) {
            console.error('❌ QuoteService.delete:', error);
            return { success: false, message: error.message };
        }
    };

    resend = async (quoteId) => {
        try {
            // TODO: Send quote email to customer
            return { success: true, message: 'Cotización reenviada' };
        } catch (error) {
            console.error('❌ QuoteService.resend:', error);
            return { success: false, message: error.message };
        }
    };

    getPDF = async (quoteId) => {
        try {
            // TODO: Generate or return PDF URL from Cloudinary
            return { success: true, message: 'PDF obtenido', data: { pdfUrl: '' } };
        } catch (error) {
            console.error('❌ QuoteService.getPDF:', error);
            return { success: false, message: error.message };
        }
    };

    getShareLink = async (quoteId) => {
        try {
            // TODO: Generate or get share token
            // TODO: Return public share link
            return { success: true, message: 'Link obtenido', data: { shareLink: '' } };
        } catch (error) {
            console.error('❌ QuoteService.getShareLink:', error);
            return { success: false, message: error.message };
        }
    };
}

export default new QuoteService();
