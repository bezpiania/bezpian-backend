import OpenAI from 'openai';
import logger from '../../utils/logger.js';

class CompanyInfoEmbeddingService {
  constructor() {
    this.modelName = 'text-embedding-3-small';
    this.embeddingDimension = 1536;
  }

  /**
   * Construye texto optimizado para embedding de información de empresa
   * Flattea todos los datos en un texto descriptivo natural
   */
  buildEmbeddingText(companyInfo) {
    const parts = [];

    if (companyInfo.company?.name) {
      parts.push(`Empresa: ${companyInfo.company.name}`);
    }

    if (companyInfo.company?.address || companyInfo.company?.city || companyInfo.company?.country) {
      const location = [
        companyInfo.company.address,
        companyInfo.company.city,
        companyInfo.company.country
      ].filter(Boolean).join(', ');
      if (location) parts.push(`Ubicación: ${location}`);
    }

    if (companyInfo.company?.phone) {
      parts.push(`Teléfono: ${companyInfo.company.phone}`);
    }

    if (companyInfo.company?.email) {
      parts.push(`Email: ${companyInfo.company.email}`);
    }

    if (companyInfo.company?.website) {
      parts.push(`Sitio web: ${companyInfo.company.website}`);
    }

    if (companyInfo.hours && companyInfo.hours.length > 0) {
      const hoursText = companyInfo.hours
        .map(h => {
          const day = h.day;
          if (h.isClosed) return `${day}: Cerrado`;
          return `${day}: ${h.open} - ${h.close}`;
        })
        .join(', ');
      parts.push(`Horarios: ${hoursText}`);
    }

    if (companyInfo.dispatches?.available) {
      const dispatchText = companyInfo.dispatches.specialCases
        ? `Despachos disponibles. ${companyInfo.dispatches.specialCases}`
        : 'Realizamos despachos';
      parts.push(dispatchText);
    }

    if (companyInfo.payments) {
      const enabledPayments = Object.entries(companyInfo.payments)
        .filter(([_, enabled]) => enabled)
        .map(([method]) => this.translatePaymentMethod(method))
        .filter(Boolean);
      if (enabledPayments.length > 0) {
        parts.push(`Métodos de pago: ${enabledPayments.join(', ')}`);
      }
    }

    if (companyInfo.social) {
      const enabledSocial = Object.entries(companyInfo.social)
        .filter(([_, handle]) => handle)
        .map(([platform, handle]) => `${platform}: ${handle}`)
        .filter(Boolean);
      if (enabledSocial.length > 0) {
        parts.push(`Redes sociales: ${enabledSocial.join(', ')}`);
      }
    }

    return parts.join('. ').substring(0, 1000);
  }

  /**
   * Traduce campos de pagos a texto amigable
   */
  translatePaymentMethod(method) {
    const translations = {
      creditCard: 'Tarjeta de crédito',
      transfer: 'Transferencia bancaria',
      paypal: 'PayPal',
      cash: 'Efectivo',
      webpay: 'Webpay',
      flow: 'Flow',
      mercadopago: 'Mercado Pago',
      maquinaPos: 'Máquina POS'
    };
    return translations[method] || method;
  }

  /**
   * Genera embedding para información de empresa
   */
  async generateEmbedding(companyInfo, openaiApiKey) {
    try {
      if (!openaiApiKey) {
        logger.warn('OpenAI API key not provided for company embedding', {
          companyInfoId: companyInfo._id,
          workspaceId: companyInfo.workspaceId
        });
        return null;
      }

      const embeddingText = this.buildEmbeddingText(companyInfo);

      if (!embeddingText || embeddingText.length === 0) {
        logger.warn('Company info is empty, skipping embedding', {
          companyInfoId: companyInfo._id,
          workspaceId: companyInfo.workspaceId
        });
        return null;
      }

      const client = new OpenAI({ apiKey: openaiApiKey });

      const response = await client.embeddings.create({
        model: this.modelName,
        input: embeddingText,
        encoding_format: 'float',
        dimensions: this.embeddingDimension
      });

      if (!response.data || response.data.length === 0) {
        logger.error('No embedding data returned from OpenAI', {
          companyInfoId: companyInfo._id,
          workspaceId: companyInfo.workspaceId
        });
        return null;
      }

      logger.info('Company info embedding generated', {
        companyInfoId: companyInfo._id,
        workspaceId: companyInfo.workspaceId,
        textLength: embeddingText.length
      });

      return {
        embedding: response.data[0].embedding,
        embeddingText,
        embeddingModel: this.modelName
      };
    } catch (error) {
      logger.error('Error generating company info embedding', {
        error: error.message,
        companyInfoId: companyInfo._id,
        workspaceId: companyInfo.workspaceId
      });
      return null;
    }
  }
}

export default new CompanyInfoEmbeddingService();
