import logger from '../../utils/logger.js';

class CitationGeneratorService {
  /**
   * Agrega citaciones inline a la respuesta
   * Identifica qué partes vienen de qué documentos
   */
  async addCitations(response, retrievedDocuments) {
    try {
      if (!response || response.length === 0 || !retrievedDocuments || retrievedDocuments.length === 0) {
        return {
          response: response || '',
          citations: [],
          citedDocuments: []
        };
      }

      // Dividir respuesta en frases
      const sentences = this.splitIntoSentences(response);

      // Mapear cada frase a su fuente
      const mappedSentences = [];
      const usedDocuments = new Set();

      for (const sentence of sentences) {
        const match = this.findSourceDocument(sentence, retrievedDocuments);

        if (match) {
          usedDocuments.add(match.documentIndex);
          mappedSentences.push({
            text: sentence,
            source: match.source,
            documentIndex: match.documentIndex,
            similarity: match.similarity
          });
        } else {
          mappedSentences.push({
            text: sentence,
            source: null,
            documentIndex: null,
            similarity: 0
          });
        }
      }

      // Construir respuesta con citaciones inline
      const citedResponse = this.buildCitedResponse(mappedSentences);

      // Recolectar citaciones únicas
      const citations = this.extractUniqueCitations(mappedSentences, retrievedDocuments);

      // Obtener documentos citados
      const citedDocuments = Array.from(usedDocuments)
        .map(idx => ({
          index: idx,
          ...retrievedDocuments[idx],
          citationCount: mappedSentences.filter(s => s.documentIndex === idx).length
        }));

      logger.info('Citations generated', {
        totalSentences: sentences.length,
        citedSentences: mappedSentences.filter(s => s.documentIndex !== null).length,
        uniqueSources: citations.length
      });

      return {
        response: citedResponse,
        citations,
        citedDocuments,
        metadata: {
          totalSentences: sentences.length,
          citedSentences: mappedSentences.filter(s => s.documentIndex !== null).length,
          citationRate: (mappedSentences.filter(s => s.documentIndex !== null).length / sentences.length * 100).toFixed(1) + '%'
        }
      };
    } catch (error) {
      logger.error('Error generating citations', {
        error: error.message
      });
      return {
        response,
        citations: [],
        citedDocuments: [],
        error: error.message
      };
    }
  }

  /**
   * Divide la respuesta en frases
   */
  splitIntoSentences(text) {
    return text
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.split(' ').length > 2);
  }

  /**
   * Encuentra el documento fuente de una frase
   */
  findSourceDocument(sentence, documents) {
    const sentenceLower = sentence.toLowerCase();
    let bestMatch = null;
    let bestScore = 0;

    for (let docIdx = 0; docIdx < documents.length; docIdx++) {
      const doc = documents[docIdx];
      const docText = (doc.text || doc.description || '').toLowerCase();

      if (docText.length === 0) continue;

      // Calcular similitud usando overlap de palabras clave
      const keywords = this.extractKeywords(sentenceLower);
      const keywordMatches = keywords.filter(kw => docText.includes(kw)).length;
      const similarity = keywords.length > 0 ? keywordMatches / keywords.length : 0;

      if (similarity > bestScore && similarity >= 0.5) {
        bestScore = similarity;
        bestMatch = {
          documentIndex: docIdx,
          source: doc.source || `Documento ${docIdx + 1}`,
          similarity: similarity.toFixed(2),
          type: doc.type
        };
      }
    }

    return bestMatch;
  }

  /**
   * Extrae palabras clave de un texto
   */
  extractKeywords(text) {
    const stopwords = new Set([
      'el', 'la', 'de', 'que', 'es', 'y', 'a', 'en', 'un', 'una',
      'por', 'con', 'su', 'para', 'o', 'del', 'las', 'los', 'se',
      'está', 'son', 'fue', 'era', 'ser', 'estar', 'tener', 'hacer'
    ]);

    return text
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopwords.has(w))
      .slice(0, 8); // Máximo 8 palabras clave
  }

  /**
   * Construye la respuesta con citaciones inline
   */
  buildCitedResponse(mappedSentences) {
    let result = '';

    for (const item of mappedSentences) {
      let sentence = item.text;

      // Agregar citación inline si hay fuente
      if (item.source && item.documentIndex !== null) {
        // Formato: "texto [según Fuente]"
        sentence = `${sentence} [según ${this.formatSourceName(item.source)}]`;
      }

      result += sentence + ' ';
    }

    return result.trim();
  }

  /**
   * Extrae citaciones únicas
   */
  extractUniqueCitations(mappedSentences, documents) {
    const citations = [];
    const seenIndices = new Set();

    for (const item of mappedSentences) {
      if (item.documentIndex !== null && !seenIndices.has(item.documentIndex)) {
        seenIndices.add(item.documentIndex);
        const doc = documents[item.documentIndex];

        citations.push({
          index: item.documentIndex,
          source: item.source,
          type: doc.type,
          sourceFile: doc.metadata?.sourceFile,
          pageNumber: doc.metadata?.pageNumber,
          url: this.generateDocumentUrl(doc)
        });
      }
    }

    return citations;
  }

  /**
   * Formatea el nombre de la fuente para mostrar
   */
  formatSourceName(source) {
    if (!source) return 'Documento';

    // Remover prefijos comunes
    if (source.includes('Document')) return 'documento';
    if (source.includes('Producto')) return 'producto';
    if (source.includes('Información de')) return 'empresa';

    // Limitar longitud
    if (source.length > 30) {
      return source.substring(0, 27) + '...';
    }

    return source;
  }

  /**
   * Genera URL del documento (para navegación)
   */
  generateDocumentUrl(document) {
    if (document.type === 'document' && document.documentId) {
      return `/documents/${document.documentId}`;
    }
    if (document.type === 'product') {
      return `/products/${document._id}`;
    }
    return null;
  }

  /**
   * Versión alternativa: citaciones como footer
   * Útil si las citaciones inline quedan muy cluttered
   */
  addFootnoteCitations(response, retrievedDocuments) {
    try {
      const sentences = this.splitIntoSentences(response);
      const mappedSentences = [];
      const citations = [];
      const citationMap = {};

      for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];
        const match = this.findSourceDocument(sentence, retrievedDocuments);

        let citationIndex = -1;
        if (match) {
          const sourceKey = `${match.documentIndex}`;
          if (!citationMap[sourceKey]) {
            citationMap[sourceKey] = citations.length;
            citations.push({
              index: citations.length + 1,
              source: match.source,
              type: match.type,
              documentIndex: match.documentIndex,
              sourceFile: retrievedDocuments[match.documentIndex].metadata?.sourceFile
            });
          }
          citationIndex = citationMap[sourceKey];
        }

        mappedSentences.push({
          text: sentence,
          citationIndex
        });
      }

      // Construir respuesta con números de citación
      let citedResponse = '';
      for (const item of mappedSentences) {
        if (item.citationIndex >= 0) {
          citedResponse += `${item.text}[${item.citationIndex + 1}] `;
        } else {
          citedResponse += item.text + ' ';
        }
      }

      // Agregar footnotes al final
      let footnotesSection = '';
      if (citations.length > 0) {
        footnotesSection = '\n\n---\nFuentes:\n';
        citations.forEach(c => {
          footnotesSection += `[${c.index}] ${c.source}${c.sourceFile ? ` (${c.sourceFile})` : ''}\n`;
        });
      }

      return {
        response: citedResponse.trim() + footnotesSection,
        citations,
        format: 'footnotes'
      };
    } catch (error) {
      logger.error('Error generating footnote citations', {
        error: error.message
      });
      return {
        response,
        citations: [],
        format: 'footnotes',
        error: error.message
      };
    }
  }

  /**
   * Validación: asegurar que todas las citaciones sean válidas
   */
  validateCitations(citedResponse, citations) {
    try {
      const errors = [];

      // Verificar que todas las citaciones mencionadas en response existan
      const citationPattern = /\[según\s+([^\]]+)\]|(\[\d+\])/g;
      const mentionedCitations = new Set();

      let match;
      while ((match = citationPattern.exec(citedResponse)) !== null) {
        mentionedCitations.add(match[1] || match[2]);
      }

      // Verificar que no haya citaciones huérfanas
      if (mentionedCitations.size > citations.length) {
        errors.push('Hay citaciones en el texto que no tienen fuente definida');
      }

      return {
        isValid: errors.length === 0,
        errors,
        mentionedCount: mentionedCitations.size,
        definedCount: citations.length
      };
    } catch (error) {
      logger.warn('Error validating citations', {
        error: error.message
      });
      return {
        isValid: false,
        errors: ['Validation error'],
        error: error.message
      };
    }
  }
}

export default new CitationGeneratorService();
