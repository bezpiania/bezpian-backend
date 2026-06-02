import logger from '../../utils/logger.js';

class LanguageDetectorService {
  constructor() {
    // Palabras clave por idioma para detección rápida
    this.languagePatterns = {
      es: {
        name: 'Spanish',
        keywords: [
          'el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'es', 'para',
          'con', 'no', 'una', 'su', 'al', 'lo', 'como', 'más', 'o', 'su',
          '¿', '¡', 'qué', 'cómo', 'dónde', 'cuándo', 'por', 'porque'
        ],
        stopwords: new Set([
          'el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'es', 'para',
          'con', 'no', 'una', 'su', 'al', 'lo', 'como', 'más', 'o',
          'este', 'ese', 'aquel', 'esto', 'eso', 'aquello', 'muy'
        ]),
        regex: /[À-ſ]/ // Latin extended characters common in Spanish
      },
      en: {
        name: 'English',
        keywords: [
          'the', 'is', 'at', 'which', 'on', 'a', 'an', 'are', 'you', 'that',
          'this', 'have', 'from', 'one', 'had', 'but', 'by', 'they', 'be', 'or'
        ],
        stopwords: new Set([
          'the', 'is', 'at', 'which', 'on', 'a', 'an', 'are', 'you', 'that',
          'this', 'have', 'from', 'one', 'be', 'or', 'and', 'in', 'to', 'for'
        ]),
        regex: /^[a-zA-Z\s\-']*$/ // ASCII only
      },
      pt: {
        name: 'Portuguese',
        keywords: [
          'o', 'a', 'de', 'que', 'e', 'do', 'da', 'em', 'um', 'para',
          'é', 'com', 'não', 'uma', 'os', 'no', 'se', 'na', 'por', 'mais',
          'as', 'dos', 'como', 'mas', 'foi', 'ao', 'ele', 'das'
        ],
        stopwords: new Set([
          'o', 'a', 'de', 'que', 'e', 'do', 'da', 'em', 'um', 'para',
          'é', 'com', 'não', 'uma', 'os', 'no', 'se', 'na', 'por', 'mais'
        ]),
        regex: /[À-ſ]/ // Similar to Spanish
      },
      fr: {
        name: 'French',
        keywords: [
          'le', 'de', 'un', 'et', 'à', 'être', 'en', 'que', 'se', 'il',
          'pour', 'la', 'ou', 'pas', 'mais', 'me', 'ce', 'qui', 'on', 'ne'
        ],
        stopwords: new Set([
          'le', 'de', 'un', 'et', 'à', 'être', 'en', 'que', 'se', 'il',
          'pour', 'la', 'ou', 'pas', 'mais', 'me', 'ce', 'qui', 'on', 'ne'
        ]),
        regex: /[À-ſ]/ // Accented characters
      },
      de: {
        name: 'German',
        keywords: [
          'der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das', 'mit', 'sich',
          'des', 'auf', 'für', 'ist', 'im', 'dem', 'nicht', 'ein', 'eine', 'als'
        ],
        stopwords: new Set([
          'der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das', 'mit', 'sich',
          'des', 'auf', 'für', 'ist', 'im', 'dem', 'nicht', 'ein', 'eine', 'als'
        ]),
        regex: /[À-ſ]/ // Umlauts and accents
      }
    };

    // Supported languages for OpenAI embeddings (all languages supported)
    this.supportedLanguages = ['es', 'en', 'pt', 'fr', 'de'];
  }

  /**
   * Detecta idioma de un texto
   * Retorna: { language: 'es', confidence: 0.95, name: 'Spanish' }
   */
  detectLanguage(text) {
    try {
      if (!text || text.length === 0) {
        return {
          language: 'unknown',
          confidence: 0,
          name: 'Unknown'
        };
      }

      const scores = {};

      // Analizar cada idioma
      for (const [langCode, langData] of Object.entries(this.languagePatterns)) {
        let score = 0;
        let matches = 0;

        const words = text.toLowerCase().split(/\s+/);

        // 1. Contar palabras clave
        for (const word of words) {
          if (langData.keywords.includes(word)) {
            matches++;
            score += 2; // Peso mayor para palabras clave
          }
        }

        // 2. Detectar caracteres especiales del idioma
        if (langData.regex.test(text)) {
          score += 1;
        }

        // 3. Analizar frecuencia de stopwords
        const stopwordCount = words.filter(w => langData.stopwords.has(w)).length;
        if (stopwordCount > words.length * 0.1) {
          score += stopwordCount * 0.5;
        }

        // Normalizar score
        scores[langCode] = Math.min(1, score / (words.length * 0.5));
      }

      // Encontrar idioma con mayor score
      const winner = Object.entries(scores).reduce((prev, current) =>
        current[1] > prev[1] ? current : prev
      );

      const [language, confidence] = winner;
      const languageData = this.languagePatterns[language];

      return {
        language,
        confidence: Math.round(confidence * 100) / 100,
        name: languageData.name,
        scores // Debug: todos los scores
      };
    } catch (error) {
      logger.error('Error detecting language', {
        error: error.message,
        textLength: text?.length
      });
      return {
        language: 'es', // Default to Spanish
        confidence: 0,
        error: error.message
      };
    }
  }

  /**
   * Obtiene lista de idiomas soportados
   */
  getSupportedLanguages() {
    return this.supportedLanguages.map(code => ({
      code,
      name: this.languagePatterns[code].name
    }));
  }

  /**
   * Valida si un idioma es soportado
   */
  isSupported(language) {
    return this.supportedLanguages.includes(language);
  }

  /**
   * Detecta idioma y retorna solo el código (helper)
   */
  getLanguageCode(text) {
    const detection = this.detectLanguage(text);
    return detection.language;
  }

  /**
   * Traduce textos comunes al idioma detectado
   */
  translateCommon(key, language) {
    const translations = {
      es: {
        'no_information': 'No tengo información sobre eso.',
        'try_again': '¿Puedo ayudarte con algo más?',
        'working_hours': 'Horarios de atención',
        'contact': 'Contacto',
        'products': 'Productos',
        'services': 'Servicios',
        'location': 'Ubicación',
        'payment_methods': 'Métodos de pago',
        'error': 'Disculpa, ocurrió un error procesando tu pregunta.'
      },
      en: {
        'no_information': 'I don\'t have information about that.',
        'try_again': 'Can I help you with something else?',
        'working_hours': 'Working Hours',
        'contact': 'Contact',
        'products': 'Products',
        'services': 'Services',
        'location': 'Location',
        'payment_methods': 'Payment Methods',
        'error': 'Sorry, there was an error processing your question.'
      },
      pt: {
        'no_information': 'Não tenho informações sobre isso.',
        'try_again': 'Posso ajudá-lo com outra coisa?',
        'working_hours': 'Horário de Funcionamento',
        'contact': 'Contato',
        'products': 'Produtos',
        'services': 'Serviços',
        'location': 'Localização',
        'payment_methods': 'Métodos de Pagamento',
        'error': 'Desculpe, ocorreu um erro ao processar sua pergunta.'
      },
      fr: {
        'no_information': 'Je n\'ai pas d\'informations à ce sujet.',
        'try_again': 'Puis-je vous aider avec quelque chose d\'autre?',
        'working_hours': 'Horaires d\'ouverture',
        'contact': 'Contact',
        'products': 'Produits',
        'services': 'Services',
        'location': 'Localisation',
        'payment_methods': 'Méthodes de Paiement',
        'error': 'Désolé, une erreur s\'est produite lors du traitement de votre question.'
      },
      de: {
        'no_information': 'Ich habe keine Informationen dazu.',
        'try_again': 'Kann ich dir noch bei etwas anderem helfen?',
        'working_hours': 'Öffnungszeiten',
        'contact': 'Kontakt',
        'products': 'Produkte',
        'services': 'Dienstleistungen',
        'location': 'Standort',
        'payment_methods': 'Zahlungsmethoden',
        'error': 'Entschuldigung, bei der Verarbeitung Ihrer Frage ist ein Fehler aufgetreten.'
      }
    };

    if (!translations[language]) {
      language = 'es'; // Default to Spanish
    }

    return translations[language][key] || translations['es'][key];
  }

  /**
   * Detecta idioma de un array de textos y retorna el idioma más común
   */
  detectPredominantLanguage(texts) {
    try {
      if (!texts || texts.length === 0) {
        return { language: 'es', confidence: 0 };
      }

      const detections = texts.map(t => this.detectLanguage(t));
      const languageCounts = {};

      // Contar por idioma ponderado por confidence
      for (const detection of detections) {
        if (detection.language !== 'unknown') {
          languageCounts[detection.language] =
            (languageCounts[detection.language] || 0) + detection.confidence;
        }
      }

      if (Object.keys(languageCounts).length === 0) {
        return { language: 'es', confidence: 0 };
      }

      // Encontrar idioma con mayor puntuación total
      const [language, score] = Object.entries(languageCounts).reduce((prev, current) =>
        current[1] > prev[1] ? current : prev
      );

      const confidence = Math.round((score / texts.length) * 100) / 100;

      return {
        language,
        confidence,
        name: this.languagePatterns[language].name
      };
    } catch (error) {
      logger.error('Error detecting predominant language', {
        error: error.message
      });
      return { language: 'es', confidence: 0 };
    }
  }

  /**
   * Obtiene el idioma basado en preferencia de usuario (fallback: detección)
   */
  getLanguage(userPreference, text) {
    // 1. Si el usuario tiene preferencia, usarlo
    if (userPreference && this.isSupported(userPreference)) {
      return userPreference;
    }

    // 2. Detectar del texto
    const detected = this.detectLanguage(text);
    if (detected.confidence > 0.6) {
      return detected.language;
    }

    // 3. Fallback: Spanish
    return 'es';
  }

  /**
   * Información de soporte multilingüe
   */
  getMultilingualInfo() {
    return {
      supportedLanguages: this.getSupportedLanguages(),
      defaultLanguage: 'es',
      embeddingModel: 'text-embedding-3-small', // Soporta todos los idiomas
      capabilities: [
        'Automatic language detection',
        'Multi-language embeddings',
        'Language-aware response generation',
        'Translated error messages',
        'Context-preserved translations'
      ]
    };
  }
}

export default new LanguageDetectorService();
