/**
 * RankingService
 * Re-ranking inteligente de resultados de búsqueda RAG
 * Usa múltiples señales para mejorar relevancia
 */

import logger from '../../utils/logger.js';

class RankingService {
  constructor() {
    this.weights = {
      similarity: 0.40,  // Similitud vectorial (principal)
      recency: 0.20,     // Documentos recientes
      popularity: 0.15,  // Documentos frecuentemente usados
      completeness: 0.15, // Metadata completa
      typeBoost: 0.10    // Prioridad por tipo
    };
  }

  /**
   * Re-rankea resultados del UnifiedSearchService
   * Toma en cuenta similitud, recencia, popularidad, completitud y tipo
   */
  async rerank(results, options = {}) {
    try {
      if (!results || results.length === 0) {
        return [];
      }

      // Aplicar scoring a cada resultado
      const scored = await Promise.all(
        results.map(r => this.scoreResult(r, options))
      );

      // Ordenar por score final
      scored.sort((a, b) => b.finalScore - a.finalScore);

      logger.info('Results re-ranked', {
        resultsCount: results.length,
        topScores: scored.slice(0, 3).map(s => ({
          type: s.type,
          score: s.finalScore.toFixed(2)
        }))
      });

      return scored.map(s => ({
        ...s.original,
        rankingScore: s.finalScore,
        rankingDetails: s.details
      }));
    } catch (error) {
      logger.error('Error in ranking', { error: error.message });
      return results; // Fallback
    }
  }

  /**
   * Calcula score compuesto para un resultado
   */
  async scoreResult(result, options = {}) {
    const scores = {};

    // 1. Similitud (40%)
    scores.similarity = result.similarity || 0;

    // 2. Recencia (20%)
    scores.recency = this.calculateRecency(result);

    // 3. Popularidad (15%)
    scores.popularity = this.calculatePopularity(result);

    // 4. Completitud (15%)
    scores.completeness = this.calculateCompleteness(result);

    // 5. Tipo boost (10%)
    scores.typeBoost = this.calculateTypeBoost(result);

    // Score final normalizado
    const finalScore = Object.entries(this.weights).reduce((sum, [key, weight]) => {
      return sum + ((scores[key] || 0) * weight);
    }, 0);

    return {
      original: result,
      finalScore: Math.min(1, Math.max(0, finalScore)),
      type: result.type,
      details: {
        similarity: scores.similarity.toFixed(3),
        recency: scores.recency.toFixed(3),
        popularity: scores.popularity.toFixed(3),
        completeness: scores.completeness.toFixed(3),
        typeBoost: scores.typeBoost.toFixed(3)
      }
    };
  }

  /**
   * Score de recencia: documentos recientes pesan más
   */
  calculateRecency(result) {
    if (!result.metadata?.createdAt) {
      return 0.5; // Neutral
    }

    const now = Date.now();
    const age = now - new Date(result.metadata.createdAt).getTime();
    const daysOld = age / (1000 * 60 * 60 * 24);

    if (daysOld <= 7) {
      return 1 - (daysOld / 7) * 0.5; // 1.0 today -> 0.5 in 7 days
    }
    return Math.max(0.2, 0.5 - daysOld / 100);
  }

  /**
   * Score de popularidad: documentos/productos usados frecuentemente
   */
  calculatePopularity(result) {
    if (result.viewCount) {
      // Log scale: 0 views = 0, 100 views = 0.63, 1000 = 0.85
      return Math.min(1, Math.log(result.viewCount + 1) / Math.log(1000));
    }
    // Productos típicamente no tienen viewCount
    return result.type === 'product' ? 0.7 : 0.5;
  }

  /**
   * Score de completitud: metadata completa es buena señal
   */
  calculateCompleteness(result) {
    let score = 0;

    if (result.type === 'document') {
      if (result.metadata?.sourceFile) score += 0.33;
      if (result.metadata?.pageNumber) score += 0.33;
      if (result.text?.length > 200) score += 0.34;
    } else if (result.type === 'product') {
      if (result.description?.length > 50) score += 0.33;
      if (result.price > 0) score += 0.33;
      if (result.category) score += 0.34;
    } else if (result.type === 'company') {
      const fields = [result.company?.name, result.hours, result.payments, result.social]
        .filter(Boolean).length;
      score = Math.min(1, fields / 4);
    }

    return score;
  }

  /**
   * Boost por tipo: priorizar productos sobre documentos
   */
  calculateTypeBoost(result) {
    const boosts = {
      'product': 1.0,   // Máximo
      'company': 0.8,   // Medio
      'document': 0.6   // Menor
    };
    return boosts[result.type] || 0.5;
  }

  /**
   * Filtra resultados por relevancia mínima
   */
  filterByRelevance(results, minScore = 0.30) {
    return results.filter(r => {
      const score = r.rankingScore || r.similarity || 0;
      return score >= minScore;
    });
  }

  /**
   * Agrupa resultados por tipo de dato
   */
  groupByType(results) {
    const grouped = {
      products: [],
      documents: [],
      company: []
    };

    results.forEach(r => {
      if (r.type === 'product') grouped.products.push(r);
      else if (r.type === 'document') grouped.documents.push(r);
      else if (r.type === 'company') grouped.company.push(r);
    });

    return grouped;
  }

  /**
   * Diversifica resultados (máximo N por source)
   */
  diversify(results, maxPerSource = 2) {
    const sourceCount = {};
    const diversified = [];

    results.forEach(result => {
      const source = result.source || 'unknown';
      if (!sourceCount[source]) sourceCount[source] = 0;

      if (sourceCount[source] < maxPerSource) {
        diversified.push(result);
        sourceCount[source]++;
      }
    });

    return diversified;
  }

  /**
   * Retorna top K resultados
   */
  topK(results, k = 5) {
    return results.slice(0, k);
  }

  /**
   * Pipeline completo: re-rank + filtro + diversify + topK
   */
  async process(results, options = {}) {
    const {
      minScore = 0.30,
      topK = 5,
      maxPerSource = 2,
      diversify: shouldDiversify = true
    } = options;

    try {
      // 1. Re-ranking
      let processed = await this.rerank(results, options);

      // 2. Filtrar por relevancia
      processed = this.filterByRelevance(processed, minScore);

      if (processed.length === 0) {
        logger.warn('No results after filtering', { minScore });
        return {
          results: [],
          grouped: { products: [], documents: [], company: [] },
          message: 'No se encontró información relevante'
        };
      }

      // 3. Diversificar si aplica
      if (shouldDiversify && processed.length > maxPerSource * 3) {
        processed = this.diversify(processed, maxPerSource);
      }

      // 4. Top K
      const topResults = this.topK(processed, topK);
      const grouped = this.groupByType(topResults);

      return {
        results: topResults,
        grouped,
        totalFound: processed.length,
        message: `Se encontraron ${processed.length} documentos relevantes`
      };
    } catch (error) {
      logger.error('Error in ranking pipeline', { error: error.message });
      return {
        results: [],
        grouped: { products: [], documents: [], company: [] },
        error: error.message
      };
    }
  }
}

export default new RankingService();
