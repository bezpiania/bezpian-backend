import EmbedService from '../../services/embed/embed.service.js';

const embedService = new EmbedService();

export default class EmbedController {

    startConversation = async (req, res) => {
        try {
            const { embedKey, visitorId, tableId } = req.body;
            const response = await embedService.startConversation(embedKey, visitorId, {}, tableId || null);
            return res.status(response.success ? 201 : 400).json(response);
        } catch (error) {
            console.error('❌ EmbedController.startConversation:', error);
            return res.status(500).json({ success: false, message: 'Error al iniciar conversación' });
        }
    };

    sendMessage = async (req, res) => {
        try {
            const { conversationId, content, botId, visitorContext } = req.body;
            if (!conversationId || !content || !botId) {
                return res.status(400).json({ success: false, message: 'conversationId, content y botId son requeridos' });
            }
            const response = await embedService.sendMessage(conversationId, content, botId, visitorContext || {});
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ EmbedController.sendMessage:', error);
            return res.status(500).json({ success: false, message: 'Error al enviar mensaje' });
        }
    };

    captureLead = async (req, res) => {
        try {
            const { conversationId, ...leadData } = req.body;
            const response = await embedService.captureLead(conversationId, leadData);
            return res.status(response.success ? 201 : 400).json(response);
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error al capturar lead' });
        }
    };

    requestQuote = async (req, res) => {
        try {
            const { conversationId, ...quoteData } = req.body;
            const response = await embedService.requestQuote(conversationId, quoteData);
            return res.status(response.success ? 201 : 400).json(response);
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error al solicitar cotización' });
        }
    };

    requestAppointment = async (req, res) => {
        try {
            const { conversationId, ...appointmentData } = req.body;
            const response = await embedService.requestAppointment(conversationId, appointmentData);
            return res.status(response.success ? 201 : 400).json(response);
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error al agendar' });
        }
    };

    getAvailability = async (req, res) => {
        try {
            const response = await embedService.getSlotsByDate(req.query);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error al obtener disponibilidad' });
        }
    };

    getAvailableDates = async (req, res) => {
        try {
            const response = await embedService.getAvailableDates(req.query);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error al obtener fechas disponibles' });
        }
    };

    getBotInfo = async (req, res) => {
        try {
            const { embedKey } = req.query;
            const response = await embedService.getBotInfo(embedKey);
            return res.status(response.success ? 200 : 404).json(response);
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    };

    getTableInfo = async (req, res) => {
        try {
            const response = await embedService.getTableInfo(req.params.tableToken);
            return res.status(response.success ? 200 : 404).json(response);
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    };

    searchProducts = async (req, res) => {
        try {
            const response = await embedService.searchProducts(req.query.embedKey, req.query.q);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error al buscar productos' });
        }
    };

    getQuoteFields = async (req, res) => {
        try {
            const response = await embedService.getQuoteFields(req.query.embedKey);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error al obtener campos' });
        }
    };

    getEmbedCode = async (req, res) => {
        try {
            const response = await embedService.getEmbedCode(req.params.botId);
            return res.status(response.success ? 200 : 404).json(response);
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error al generar código embed' });
        }
    };
}
