import Quote from '../../models/Quote.js';
import Chatbot from '../../models/Chatbot.js';
import crypto from 'crypto';

const getWsId = (req) => req.params.wsId || req.params.workspaceId;
// Find quote ensuring it belongs to the workspace (prevents cross-tenant access)
const findQuote = (id, wsId) => wsId
  ? Quote.findOne({ _id: id, workspaceId: wsId })
  : Quote.findById(id);

export default class QuoteController {
  create = async (req, res) => {
    try {
      const { wsId, cbId } = req.params;
      const { items, customerData, conversationId, leadId } = req.body;

      // Validar datos
      if (!items || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Items no puede estar vacío' });
      }

      // Calcular totales
      let subtotal = 0;
      items.forEach(item => {
        const itemSubtotal = item.quantity * item.unitPrice;
        subtotal += itemSubtotal;
      });

      // Generar número de cotización único
      const quoteNumber = `QT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

      // Crear cotización
      const quote = await Quote.create({
        chatbotId: cbId,
        workspaceId: wsId,
        conversationId,
        leadId,
        quoteNumber,
        items,
        subtotal,
        tax: 0, // Se puede calcular después si es necesario
        total: subtotal,
        currency: 'CLP',
        customerData,
        status: 'draft',
        shareToken: crypto.randomBytes(16).toString('hex'),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 días
      });

      res.status(201).json({ success: true, data: quote });
    } catch (error) {
      console.error('Error creating quote:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  list = async (req, res) => {
    try {
      const { wsId, workspaceId, cbId } = req.params;
      const wsIdValue = wsId || workspaceId;

      // Si hay cbId, filtrar por workspace + chatbot
      // Si no hay cbId, filtrar solo por workspace
      const query = { workspaceId: wsIdValue };
      if (cbId) {
        query.chatbotId = cbId;
      }

      const quotes = await Quote.find(query).sort({ createdAt: -1 });
      res.json({ success: true, data: quotes });
    } catch (error) {
      console.error('Error getting quotes:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  patch = async (req, res) => {
    try {
      const { wsId, cbId, id } = req.params;
      const { status } = req.body;
      const quote = await Quote.findOneAndUpdate(
        { _id: id, workspaceId: wsId, chatbotId: cbId },
        { status },
        { new: true }
      );
      if (!quote) {
        return res.status(404).json({ success: false, message: 'Cotización no encontrada' });
      }
      res.json({ success: true, data: quote });
    } catch (error) {
      console.error('Error updating quote:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  delete = async (req, res) => {
    try {
      const { wsId, cbId, id } = req.params;
      const quote = await Quote.findOneAndDelete({
        _id: id,
        workspaceId: wsId,
        chatbotId: cbId,
      });
      if (!quote) {
        return res.status(404).json({ success: false, message: 'Cotización no encontrada' });
      }
      res.json({ success: true, message: 'Cotización eliminada' });
    } catch (error) {
      console.error('Error deleting quote:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  get = async (req, res) => {
    try {
      const { id } = req.params;
      console.log('🔍 GET quote:', { id, params: req.params });

      const quote = await findQuote(id, getWsId(req));
      if (!quote) return res.status(404).json({ success: false, message: 'Cotización no encontrada' });
      res.json({ success: true, data: quote });
    } catch (error) {
      console.error('Error getting quote:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  update = async (req, res) => {
    try {
      const { id } = req.params;
      const wsId = getWsId(req);
      const query = wsId ? { _id: id, workspaceId: wsId } : { _id: id };
      const quote = await Quote.findOneAndUpdate(query, req.body, { new: true });
      if (!quote) return res.status(404).json({ success: false, message: 'Cotización no encontrada' });
      res.json({ success: true, data: quote });
    } catch (error) {
      console.error('Error updating quote:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  resend = async (req, res) => {
    try {
      const { id } = req.params;
      const quote = await findQuote(id, getWsId(req));
      if (!quote) {
        return res.status(404).json({ success: false, message: 'Cotización no encontrada' });
      }
      // TODO: Send quote email
      res.json({ success: true, message: 'Cotización reenviada' });
    } catch (error) {
      console.error('Error resending quote:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  getPDF = async (req, res) => {
    try {
      const { id } = req.params;
      const quote = await findQuote(id, getWsId(req));
      if (!quote) {
        return res.status(404).json({ success: false, message: 'Cotización no encontrada' });
      }
      // TODO: Generate and send PDF
      res.json({ success: true, message: 'PDF generado' });
    } catch (error) {
      console.error('Error getting quote PDF:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  getShareLink = async (req, res) => {
    try {
      const { id } = req.params;
      const quote = await findQuote(id, getWsId(req));
      if (!quote) {
        return res.status(404).json({ success: false, message: 'Cotización no encontrada' });
      }
      const shareLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/cotizacion/${quote.shareToken}`;
      res.json({ success: true, data: { shareLink } });
    } catch (error) {
      console.error('Error getting share link:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  getFields = async (req, res) => {
    try {
      const { cbId } = req.params;
      const chatbot = await Chatbot.findById(cbId).select('quoteFields');
      if (!chatbot) {
        return res.status(404).json({ success: false, message: 'Chatbot no encontrado' });
      }
      const fields = chatbot.quoteFields || [];
      res.json({ success: true, data: fields });
    } catch (error) {
      console.error('Error getting quote fields:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  getByShareToken = async (req, res) => {
    try {
      const { shareToken } = req.params;
      console.log('🔍 GET public quote by shareToken:', { shareToken });

      const quote = await Quote.findOne({ shareToken });
      if (!quote) {
        console.log('❌ Quote not found for shareToken:', shareToken);
        return res.status(404).json({ success: false, message: 'Cotización no encontrada' });
      }

      // Track view
      quote.viewCount = (quote.viewCount || 0) + 1;
      quote.viewedAt = new Date();
      await quote.save();

      console.log('✅ Public quote found:', { quoteNumber: quote.quoteNumber });
      res.json({ success: true, data: quote });
    } catch (error) {
      console.error('Error getting public quote:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  accept = async (req, res) => {
    try {
      const { id } = req.params;
      const quote = await Quote.findByIdAndUpdate(
        id,
        {
          status: 'accepted',
          acceptedAt: new Date()
        },
        { new: true }
      );

      if (!quote) {
        return res.status(404).json({ success: false, message: 'Cotización no encontrada' });
      }

      console.log('✅ Quote accepted:', { quoteNumber: quote.quoteNumber });
      res.json({ success: true, data: quote });
    } catch (error) {
      console.error('Error accepting quote:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  resend = async (req, res) => {
    try {
      const { id } = req.params;
      const quote = await findQuote(id, getWsId(req));
      if (!quote) {
        return res.status(404).json({ success: false, message: 'Cotización no encontrada' });
      }

      quote.sentAt = new Date();
      quote.status = quote.status === 'draft' ? 'sent' : quote.status;
      await quote.save();

      console.log(`📧 Quote resend marked: ${quote.quoteNumber} to ${quote.companySummary?.email}`);
      res.json({ success: true, message: 'Cotización reenviada', data: quote });
    } catch (error) {
      console.error('Error resending quote:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  getPDF = async (req, res) => {
    try {
      const { id } = req.params;
      const quote = await findQuote(id, getWsId(req));
      if (!quote) {
        return res.status(404).json({ success: false, message: 'Cotización no encontrada' });
      }

      // For now, return JSON. In production, generate actual PDF via pdfkit or puppeteer
      res.setHeader('Content-Type', 'application/json');
      res.json({
        success: true,
        message: 'PDF generation not yet implemented',
        data: quote
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };
}
