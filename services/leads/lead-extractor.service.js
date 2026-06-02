import logger from '../../utils/logger.js';

class LeadExtractorService {
  /**
   * Extrae información de lead del mensaje del usuario
   * Busca: email, teléfono, nombre, empresa
   */
  extractLeadInfo = (userMessage) => {
    const extracted = {
      email: null,
      phone: null,
      name: null,
      company: null
    };

    if (!userMessage || typeof userMessage !== 'string') {
      return extracted;
    }

    const text = userMessage.trim();

    // Extraer email
    const emailRegex = /[\w\.-]+@[\w\.-]+\.\w+/g;
    const emailMatches = text.match(emailRegex);
    if (emailMatches) {
      extracted.email = emailMatches[0];
    }

    // Extraer teléfono (formatos: +56912345678, 912345678, +569 1234 5678, etc.)
    const phoneRegex = /(?:\+?56)?[\s]?(?:9)?[\s]?[0-9]{4}[\s]?[0-9]{4}/g;
    const phoneMatches = text.match(phoneRegex);
    if (phoneMatches) {
      // Normalizar teléfono: quitar espacios, convertir a formato +56...
      let phone = phoneMatches[0].replace(/\s/g, '');
      if (!phone.startsWith('+')) {
        phone = phone.replace(/^0/, '');
        phone = '+56' + phone;
      }
      extracted.phone = phone;
    }

    // Extraer nombre: busca patrones como "Mi nombre es Juan" o "Soy Juan García"
    const namePatterns = [
      /me llamo\s+([A-Z][a-zá-ú]+(?:\s+[A-Z][a-zá-ú]+)?)/i,
      /mi nombre es\s+([A-Z][a-zá-ú]+(?:\s+[A-Z][a-zá-ú]+)?)/i,
      /soy\s+([A-Z][a-zá-ú]+(?:\s+[A-Z][a-zá-ú]+)?)/i,
      /^([A-Z][a-zá-ú]+(?:\s+[A-Z][a-zá-ú]+)?)\s+(?:aquí|acá|presente|speaking)/i,
      /^(?:Hola|Hola hola|Buenas)\s+soy\s+([A-Z][a-zá-ú]+(?:\s+[A-Z][a-zá-ú]+)?)/i
    ];

    for (const pattern of namePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        extracted.name = match[1].trim();
        break;
      }
    }

    // Extraer empresa: busca patrones como "de [Empresa]", "empresa [Empresa]", etc.
    const companyPatterns = [
      /de\s+(?:la\s+empresa\s+)?([A-Z][A-Za-zá-ú0-9\s\.\&\-]+)(?:\s+(?:aquí|acá|presente))?$/i,
      /(?:trabajo\s+)?en\s+([A-Z][A-Za-zá-ú0-9\s\.\&\-]+)$/i,
      /(?:soy\s+)?de\s+([A-Z][A-Za-zá-ú0-9\s\.\&\-]+)$/i
    ];

    for (const pattern of companyPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        // Limpiar empresa: quitar palabras comunes al final
        let company = match[1]
          .replace(/\s+(?:aquí|acá|presente|chile)$/i, '')
          .trim();

        if (company.length > 2 && company.length < 100) {
          extracted.company = company;
          break;
        }
      }
    }

    return extracted;
  };

  /**
   * Acumula información extraída con info anterior
   * Retorna información combinada + si está completa
   */
  accumulateLeadInfo = (previousInfo = {}, newExtracted = {}) => {
    const accumulated = {
      email: previousInfo.email || newExtracted.email,
      phone: previousInfo.phone || newExtracted.phone,
      name: previousInfo.name || newExtracted.name,
      company: previousInfo.company || newExtracted.company,
      updatedAt: new Date()
    };

    return accumulated;
  };

  /**
   * Verifica si la información extraída completa los campos requeridos
   * @param {Object} leadInfo - Información acumulada del lead
   * @param {Array} requiredFields - Array de strings con nombres de campos requeridos: ['name', 'email', 'phone', ...]
   */
  isLeadComplete = (leadInfo, requiredFields = []) => {
    if (!requiredFields || requiredFields.length === 0) {
      // Por defecto, se requieren: email y name
      requiredFields = ['email', 'name'];
    }

    for (const fieldName of requiredFields) {
      if (!leadInfo[fieldName]) {
        return false;
      }
    }

    return true;
  };

  /**
   * Obtiene lista de campos requeridos de la configuración del chatbot
   */
  getRequiredFields = (chatbot) => {
    // Leer desde features.leadCaptureFields (estructura existente en UI)
    const leadCaptureFields = chatbot?.features?.leadCaptureFields;

    if (!leadCaptureFields) {
      // Campos por defecto: name y email requeridos
      return ['name', 'email'];
    }

    // Retornar solo los campos que están activados (true)
    const requiredFields = [];
    if (leadCaptureFields.name) requiredFields.push('name');
    if (leadCaptureFields.email) requiredFields.push('email');
    if (leadCaptureFields.phone) requiredFields.push('phone');
    if (leadCaptureFields.company) requiredFields.push('company');

    // Si ninguno está activo, retornar por defecto
    return requiredFields.length > 0 ? requiredFields : ['name', 'email'];
  };

  /**
   * Crea un resumen legible del lead pendiente
   * @param {Object} leadInfo - Información acumulada del lead
   * @param {Array} requiredFields - Array de strings: ['name', 'email', 'phone', ...]
   */
  getMissingFieldsMessage = (leadInfo, requiredFields = []) => {
    if (!requiredFields || requiredFields.length === 0) {
      requiredFields = ['email', 'name'];
    }

    const missing = requiredFields.filter(fieldName => !leadInfo[fieldName]);
    if (missing.length === 0) return null;

    const fieldLabels = {
      email: 'correo electrónico',
      phone: 'teléfono',
      name: 'nombre',
      company: 'empresa'
    };

    const missingLabels = missing.map(fieldName => fieldLabels[fieldName] || fieldName);
    return `Falta: ${missingLabels.join(', ')}`;
  };
}

export default new LeadExtractorService();
