import logger from '../../utils/logger.js';
import QuoteService from './quote.service.js';

class QuoteGeneratorService {
  /**
   * Detecta si el usuario está pidiendo una cotización
   */
  isQuoteRequest = (userMessage) => {
    if (!userMessage || typeof userMessage !== 'string') {
      return false;
    }

    const quotePhrases = [
      /cotizaci[óo]n/i,
      /quote/i,
      /presupuesto/i,
      /cuanto cuesta/i,
      /cual es el precio/i,
      /me cobras por/i,
      /valor total/i,
      /enviarme un presupuesto/i,
      /necesito un presupuesto/i,
      /puedes cotizar/i,
      /cotiza esto/i,
      /dame una cotizaci[óo]n/i
    ];

    return quotePhrases.some(phrase => phrase.test(userMessage));
  };

  /**
   * Extrae información de productos del contexto/mensaje
   * Retorna array de items: [{ name, quantity, unitPrice, productId }]
   */
  extractQuoteItems = (products = []) => {
    if (!products || products.length === 0) {
      return [];
    }

    // Convertir productos a items de cotización
    return products.map(product => ({
      productId: product._id?.toString() || product.id,
      name: product.name,
      quantity: product.quotedQuantity || 1,
      unitPrice: product.price || 0,
      subtotal: (product.quotedQuantity || 1) * (product.price || 0)
    }));
  };

  /**
   * Genera una cotización a partir de la información de la conversación
   */
  generateQuote = async (conversationId, chatbotId, workspaceId, quoteData) => {
    try {
      const { items, customerData } = quoteData;

      if (!items || items.length === 0) {
        return {
          success: false,
          message: 'No hay productos para cotizar',
          action: 'quote_error'
        };
      }

      // Crear cotización usando QuoteService
      const result = await QuoteService.create(workspaceId, chatbotId, {
        items,
        customerData,
        conversationId,
        leadId: quoteData.leadId || null
      });

      if (!result.success) {
        return {
          success: false,
          message: result.message,
          action: 'quote_error'
        };
      }

      logger.info(`✅ Quote generated from chat:`, {
        quoteId: result.data._id,
        conversationId,
        itemCount: items.length
      });

      return {
        success: true,
        message: 'Cotización generada',
        action: 'quote_created',
        quoteId: result.data._id,
        quoteNumber: result.data.quoteNumber,
        quoteData: result.data
      };
    } catch (error) {
      logger.error('❌ Error generating quote:', {
        message: error?.message || String(error),
        stack: error?.stack,
        fullError: error
      });
      return {
        success: false,
        message: error?.message || 'Error desconocido al generar cotización',
        action: 'quote_error'
      };
    }
  };

  /**
   * Obtiene el mensaje de respuesta para presentar la cotización al usuario
   */
  getQuoteResponseMessage = (quote) => {
    if (!quote) return null;

    let message = `Perfecto, aquí está tu cotización:\n\n`;
    message += `📋 **Cotización #${quote.quoteNumber}**\n\n`;

    // Detallar items
    if (quote.items && quote.items.length > 0) {
      message += `**Productos:**\n`;
      quote.items.forEach((item, idx) => {
        const subtotal = item.quantity * item.unitPrice;
        message += `${idx + 1}. ${item.name}\n`;
        message += `   - Cantidad: ${item.quantity}\n`;
        message += `   - Precio unitario: $${item.unitPrice.toLocaleString('es-CL')}\n`;
        message += `   - Subtotal: $${subtotal.toLocaleString('es-CL')}\n\n`;
      });
    }

    // Totales
    message += `---\n`;
    message += `**Subtotal:** $${quote.subtotal.toLocaleString('es-CL')}\n`;
    if (quote.tax && quote.tax > 0) {
      message += `**Impuesto:** $${quote.tax.toLocaleString('es-CL')}\n`;
    }
    message += `**Total:** $${quote.total.toLocaleString('es-CL')}\n`;
    message += `**Moneda:** ${quote.currency}\n\n`;

    // Info adicional
    message += `✅ Cotización válida por 30 días\n`;
    message += `📧 Te enviaremos los detalles por email`;

    return message;
  };
}

export default new QuoteGeneratorService();
