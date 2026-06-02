import logger from '../../utils/logger.js';

class GuardrailsService {
  constructor() {
    this.hallucintationThreshold = 0.5; // 50% risk threshold
  }

  /**
   * Valida que la respuesta esté grounded en los documentos recuperados
   * Retorna { isValid, riskScore, reason }
   */
  validateAnswerAgainstDocuments(answer, retrievedDocuments) {
    try {
      if (!answer || !retrievedDocuments || retrievedDocuments.length === 0) {
        return {
          isValid: false,
          riskScore: 1.0,
          reason: 'No documents retrieved for validation'
        };
      }

      // Combinar texto de todos los documentos
      const documentText = retrievedDocuments
        .map(d => d.text || d.description || '')
        .join(' ')
        .toLowerCase();

      // Analizar frases clave de la respuesta
      const answerSentences = answer.split(/[.!?]+/).filter(s => s.trim().length > 0);

      let matchedSentences = 0;
      let ungroundedSentences = [];

      for (const sentence of answerSentences) {
        const sentenceLower = sentence.toLowerCase().trim();

        // Extraer palabras clave (sin stopwords)
        const keywords = this.extractKeywords(sentenceLower);

        // Chequear si la mayoría de palabras clave aparecen en documentos
        const keywordMatches = keywords.filter(kw => documentText.includes(kw)).length;
        const matchRatio = keywords.length > 0 ? keywordMatches / keywords.length : 0;

        if (matchRatio >= 0.6) {
          matchedSentences++;
        } else {
          ungroundedSentences.push(sentence.trim());
        }
      }

      // Calcular riesgo de alucinación
      const matchedRatio = answerSentences.length > 0
        ? matchedSentences / answerSentences.length
        : 0;

      const riskScore = 1 - matchedRatio;

      return {
        isValid: matchedRatio >= 0.7,
        riskScore,
        matchedRatio: (matchedRatio * 100).toFixed(0) + '%',
        ungroundedSentences: ungroundedSentences.slice(0, 3),
        reason: matchedRatio < 0.7 ? 'Answer not sufficiently grounded in documents' : 'Answer is grounded'
      };
    } catch (error) {
      logger.error('Error validating answer against documents', {
        error: error.message
      });
      return {
        isValid: false,
        riskScore: 0.5,
        reason: 'Validation error: ' + error.message
      };
    }
  }

  /**
   * Detecta signos de alucinación en la respuesta
   * Busca patrones comunes de fabricación
   */
  detectHallucinations(answer, context = {}) {
    const hallucinations = [];

    // 1. Números/datos sin fuente
    const numberPattern = /\b\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}\b|\b\$[\d,]+(?:\.\d{2})?\b|\b\d+%\b|\b\d{1,3}[.,]\d{1,3}\b/g;
    const numbers = answer.match(numberPattern) || [];

    if (numbers.length > 0) {
      const groundedNumbers = this.checkNumbersInDocuments(numbers, context.documents || []);
      if (groundedNumbers.ungrounded.length > 0) {
        hallucinations.push({
          type: 'UNGROUNDED_NUMBERS',
          severity: 'high',
          items: groundedNumbers.ungrounded.slice(0, 3),
          message: 'Números/datos sin fuente en documentos'
        });
      }
    }

    // 2. Afirmaciones específicas de personas/lugares sin fuente
    const specificClaimsPattern = /(?:según|de acuerdo|reporta|menciona|dice que)\s+([^.!?]+)/gi;
    const specificClaims = [...answer.matchAll(specificClaimsPattern)].map(m => m[1]);

    if (specificClaims.length > 0 && !context.hasExtensiveDocuments) {
      hallucinations.push({
        type: 'SPECIFIC_CLAIMS',
        severity: 'medium',
        count: specificClaims.length,
        message: 'Afirmaciones específicas sin suficiente contexto'
      });
    }

    // 3. Contradiciones internas
    const contradictions = this.findInternalContradictions(answer);
    if (contradictions.length > 0) {
      hallucinations.push({
        type: 'INTERNAL_CONTRADICTION',
        severity: 'high',
        items: contradictions,
        message: 'Contradicciones internas en la respuesta'
      });
    }

    // 4. Certeza excesiva sin pruebas
    const overconfidentPattern = /\b(?:definitivamente|absolutamente|sin duda|100%|siempre|nunca)\b/gi;
    const overconfidentMatches = answer.match(overconfidentPattern) || [];

    if (overconfidentMatches.length > 2) {
      hallucinations.push({
        type: 'OVERCONFIDENCE',
        severity: 'medium',
        count: overconfidentMatches.length,
        message: 'Nivel de certeza muy alto sin suficientes pruebas'
      });
    }

    // Calcular risk score general
    const riskScore = Math.min(1, hallucinations.length * 0.3);

    return {
      hallucinations,
      riskScore,
      isSuspicious: riskScore > this.hallucintationThreshold
    };
  }

  /**
   * Valida consistencia de hechos entre respuesta y documentos
   */
  checkFactConsistency(answer, companyInfo = {}) {
    try {
      const inconsistencies = [];

      // 1. Horarios
      if (companyInfo.hours && companyInfo.hours.length > 0) {
        const hoursCheck = this.validateHoursConsistency(answer, companyInfo.hours);
        if (hoursCheck.inconsistencies.length > 0) {
          inconsistencies.push(...hoursCheck.inconsistencies);
        }
      }

      // 2. Información de contacto
      if (companyInfo.company?.phone || companyInfo.company?.email) {
        const contactCheck = this.validateContactConsistency(answer, companyInfo.company);
        if (contactCheck.inconsistencies.length > 0) {
          inconsistencies.push(...contactCheck.inconsistencies);
        }
      }

      // 3. Métodos de pago
      if (companyInfo.payments) {
        const paymentCheck = this.validatePaymentConsistency(answer, companyInfo.payments);
        if (paymentCheck.inconsistencies.length > 0) {
          inconsistencies.push(...paymentCheck.inconsistencies);
        }
      }

      return {
        isConsistent: inconsistencies.length === 0,
        inconsistencies,
        riskScore: Math.min(1, inconsistencies.length * 0.25)
      };
    } catch (error) {
      logger.error('Error checking fact consistency', {
        error: error.message
      });
      return {
        isConsistent: false,
        inconsistencies: [],
        riskScore: 0.5
      };
    }
  }

  /**
   * Valida horarios en la respuesta
   */
  validateHoursConsistency(answer, companyHours) {
    const inconsistencies = [];
    const answerLower = answer.toLowerCase();

    // Buscar menciones de horarios
    const hoursPattern = /(\d{1,2}):(\d{2})\s*(?:am|pm|a\.m\.|p\.m\.)?/gi;
    const mentionedTimes = [...answer.matchAll(hoursPattern)];

    if (mentionedTimes.length === 0) {
      return { inconsistencies: [] };
    }

    // Verificar que los horarios mencionados estén en companyHours
    const validHours = new Set();
    companyHours.forEach(h => {
      if (!h.isClosed) {
        validHours.add(`${h.open}:00`);
        validHours.add(`${h.close}:00`);
      }
    });

    for (const match of mentionedTimes) {
      const time = `${match[1]}:${match[2]}`;
      if (!validHours.has(time) && validHours.size > 0) {
        inconsistencies.push({
          type: 'INVALID_HOURS',
          mentioned: time,
          validHours: Array.from(validHours).slice(0, 3)
        });
      }
    }

    return { inconsistencies };
  }

  /**
   * Valida información de contacto
   */
  validateContactConsistency(answer, company) {
    const inconsistencies = [];
    const answerLower = answer.toLowerCase();

    // Si mencionamos teléfono, verificar que coincida
    if (company.phone && answerLower.includes('teléfono')) {
      const phonePattern = /\+?56?\s?[2-9]\d{7,8}/g;
      const mentionedPhones = answer.match(phonePattern) || [];

      if (mentionedPhones.length > 0 && !mentionedPhones.some(p => company.phone.includes(p))) {
        inconsistencies.push({
          type: 'PHONE_MISMATCH',
          companyPhone: company.phone,
          mentionedPhones
        });
      }
    }

    // Si mencionamos email, verificar que coincida
    if (company.email && answerLower.includes('email')) {
      const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
      const mentionedEmails = answer.match(emailPattern) || [];

      if (mentionedEmails.length > 0 && !mentionedEmails.some(e => company.email.includes(e))) {
        inconsistencies.push({
          type: 'EMAIL_MISMATCH',
          companyEmail: company.email,
          mentionedEmails
        });
      }
    }

    return { inconsistencies };
  }

  /**
   * Valida métodos de pago
   */
  validatePaymentConsistency(answer, payments) {
    const inconsistencies = [];
    const answerLower = answer.toLowerCase();

    const paymentMethods = {
      'tarjeta de crédito': payments.creditCard,
      'transferencia': payments.transfer,
      'paypal': payments.paypal,
      'efectivo': payments.cash,
      'webpay': payments.webpay,
      'flow': payments.flow,
      'mercado pago': payments.mercadopago,
      'máquina pos': payments.maquinaPos
    };

    for (const [method, isAvailable] of Object.entries(paymentMethods)) {
      if (answerLower.includes(method)) {
        // Si mencionamos un método, debe estar disponible
        if (!isAvailable) {
          inconsistencies.push({
            type: 'PAYMENT_METHOD_NOT_AVAILABLE',
            method,
            mentioned: true
          });
        }
      }
    }

    return { inconsistencies };
  }

  /**
   * Busca contradicciones internas en la respuesta
   */
  findInternalContradictions(answer) {
    const contradictions = [];

    // Buscar negaciones seguidas de afirmaciones
    const sentences = answer.split(/[.!?]+/);
    const statements = new Map();

    sentences.forEach(sentence => {
      const trimmed = sentence.trim().toLowerCase();
      if (trimmed.length === 0) return;

      // Detectar: "no X" y luego "X"
      const negativeMatch = /^(?:no|nunca|sin)\s+(.+)$/.exec(trimmed);
      const positiveMatch = /^(?:sí|siempre|con)\s+(.+)$/.exec(trimmed);

      if (negativeMatch) {
        const concept = negativeMatch[1];
        if (statements.has(concept) && statements.get(concept) === 'positive') {
          contradictions.push(`"No ${concept}" contradicts earlier claim`);
        }
        statements.set(concept, 'negative');
      }

      if (positiveMatch) {
        const concept = positiveMatch[1];
        if (statements.has(concept) && statements.get(concept) === 'negative') {
          contradictions.push(`"${concept}" contradicts earlier negative claim`);
        }
        statements.set(concept, 'positive');
      }
    });

    return contradictions.slice(0, 3);
  }

  /**
   * Verifica números no documentados
   */
  checkNumbersInDocuments(numbers, documents) {
    const documentText = documents
      .map(d => d.text || d.description || '')
      .join(' ')
      .toLowerCase();

    const grounded = [];
    const ungrounded = [];

    for (const num of numbers) {
      if (documentText.includes(num)) {
        grounded.push(num);
      } else {
        ungrounded.push(num);
      }
    }

    return { grounded, ungrounded };
  }

  /**
   * Extrae palabras clave (sin stopwords)
   */
  extractKeywords(text) {
    const stopwords = new Set([
      'el', 'la', 'de', 'que', 'es', 'y', 'a', 'en', 'un', 'una',
      'por', 'con', 'su', 'para', 'o', 'del', 'las', 'los', 'se',
      'está', 'está', 'son', 'fue', 'era', 'ser', 'estar', 'tener',
      'hacer', 'ir', 'ver', 'poder', 'decir', 'dar', 'saber', 'querer',
      'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'este',
      'ese', 'aquel', 'esto', 'eso', 'aquello', 'mi', 'tu', 'su', 'nuestro'
    ]);

    const words = text
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopwords.has(w));

    return words;
  }

  /**
   * Score de hallucination global
   * Combina múltiples checks
   */
  async scoreHallucination(answer, documents, companyInfo) {
    try {
      const validation = this.validateAnswerAgainstDocuments(answer, documents);
      const hallucinations = this.detectHallucinations(answer, { documents, hasExtensiveDocuments: documents.length > 3 });
      const factCheck = this.checkFactConsistency(answer, companyInfo);

      // Weighted scoring
      const riskScore =
        (validation.riskScore * 0.40) +
        (hallucinations.riskScore * 0.40) +
        (factCheck.riskScore * 0.20);

      return {
        overallRisk: Math.min(1, Math.max(0, riskScore)),
        isSuspicious: riskScore > this.hallucintationThreshold,
        components: {
          validation,
          hallucinations,
          factCheck
        }
      };
    } catch (error) {
      logger.error('Error scoring hallucination', {
        error: error.message
      });
      return {
        overallRisk: 0.5,
        isSuspicious: true,
        error: error.message
      };
    }
  }
}

export default new GuardrailsService();
