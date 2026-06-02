import logger from '../../utils/logger.js';

class RAGMetricsService {
  constructor() {
    this.metrics = new Map(); // chatbotId -> metrics
    this.globalMetrics = {
      totalQueries: 0,
      totalLatency: 0,
      embeddingCost: 0,
      cacheHits: 0,
      cacheMisses: 0,
      hallucinations: 0,
      questionsAnswered: 0,
      questionsNotAnswered: 0
    };
  }

  /**
   * Registra métrica de una respuesta RAG
   */
  recordQuery(chatbotId, metric) {
    try {
      // Inicializar si no existe
      if (!this.metrics.has(chatbotId)) {
        this.metrics.set(chatbotId, {
          chatbotId,
          totalQueries: 0,
          answeredQueries: 0,
          notAnsweredQueries: 0,
          totalLatency: 0,
          avgLatency: 0,
          p95Latency: 0,
          hallucinations: 0,
          hallucintationRate: 0,
          citationRate: 0,
          cacheHitRate: 0,
          embeddingCost: 0,
          cacheSavings: 0,
          topQueries: [],
          recentQueries: [],
          questionsNotAnswered: []
        });
      }

      const chatbotMetrics = this.metrics.get(chatbotId);

      // Actualizar contadores
      chatbotMetrics.totalQueries++;
      this.globalMetrics.totalQueries++;

      // Latency
      const latency = metric.latencyMs || 0;
      chatbotMetrics.totalLatency += latency;
      this.globalMetrics.totalLatency += latency;
      chatbotMetrics.avgLatency = Math.round(chatbotMetrics.totalLatency / chatbotMetrics.totalQueries);

      // Cache
      if (metric.fromCache) {
        chatbotMetrics.cacheHitRate = (this.globalMetrics.cacheHits + 1) / this.globalMetrics.totalQueries;
        this.globalMetrics.cacheHits++;
      } else {
        this.globalMetrics.cacheMisses++;
      }

      // Respuestas
      if (metric.confidence >= 0.7) {
        chatbotMetrics.answeredQueries++;
        this.globalMetrics.questionsAnswered++;
      } else {
        chatbotMetrics.notAnsweredQueries++;
        this.globalMetrics.questionsNotAnswered++;
        if (metric.query) {
          chatbotMetrics.questionsNotAnswered.push({
            query: metric.query,
            confidence: metric.confidence,
            timestamp: new Date()
          });
        }
      }

      // Hallucinations
      if (metric.hallucintationRisk > 0.5) {
        chatbotMetrics.hallucinations++;
        this.globalMetrics.hallucinations++;
      }
      chatbotMetrics.hallucintationRate =
        Math.round((chatbotMetrics.hallucinations / chatbotMetrics.totalQueries) * 100) / 100;

      // Citations
      const citedCount = metric.citedDocuments?.length || 0;
      const hasAnswer = metric.answer && metric.answer.length > 0;
      if (hasAnswer) {
        const currentRate = chatbotMetrics.citationRate || 0;
        chatbotMetrics.citationRate =
          (currentRate * (chatbotMetrics.totalQueries - 1) + (citedCount > 0 ? 1 : 0)) / chatbotMetrics.totalQueries;
      }

      // Costo y ahorros
      if (metric.embeddingCost) {
        chatbotMetrics.embeddingCost += metric.embeddingCost;
        this.globalMetrics.embeddingCost += metric.embeddingCost;
      }

      if (metric.fromCache && metric.cacheSavings) {
        chatbotMetrics.cacheSavings += metric.cacheSavings;
      }

      // Top queries
      this.updateTopQueries(chatbotMetrics, metric.query, metric.confidence);

      // Recent queries (últimas 100)
      chatbotMetrics.recentQueries.push({
        query: metric.query,
        confidence: metric.confidence,
        latency: metric.latencyMs,
        fromCache: metric.fromCache,
        timestamp: new Date()
      });

      if (chatbotMetrics.recentQueries.length > 100) {
        chatbotMetrics.recentQueries.shift();
      }

      logger.debug('RAG metric recorded', {
        chatbotId,
        query: metric.query?.substring(0, 50),
        confidence: metric.confidence.toFixed(2),
        latency: metric.latencyMs,
        fromCache: metric.fromCache
      });
    } catch (error) {
      logger.error('Error recording RAG metric', {
        error: error.message,
        chatbotId
      });
    }
  }

  /**
   * Actualiza top queries (por frecuencia)
   */
  updateTopQueries(chatbotMetrics, query, confidence) {
    if (!query) return;

    const existing = chatbotMetrics.topQueries.find(q => q.query === query);

    if (existing) {
      existing.count++;
      existing.avgConfidence = (existing.avgConfidence * (existing.count - 1) + confidence) / existing.count;
    } else {
      chatbotMetrics.topQueries.push({
        query,
        count: 1,
        avgConfidence: confidence,
        lastAsked: new Date()
      });
    }

    // Ordenar y mantener top 20
    chatbotMetrics.topQueries.sort((a, b) => b.count - a.count);
    if (chatbotMetrics.topQueries.length > 20) {
      chatbotMetrics.topQueries = chatbotMetrics.topQueries.slice(0, 20);
    }
  }

  /**
   * Obtiene métricas de un chatbot
   */
  getMetrics(chatbotId) {
    if (!this.metrics.has(chatbotId)) {
      return {
        error: 'No metrics found for chatbot',
        chatbotId
      };
    }

    const m = this.metrics.get(chatbotId);

    return {
      ...m,
      answeredRate: m.totalQueries > 0
        ? Math.round((m.answeredQueries / m.totalQueries) * 100) / 100
        : 0,
      cacheHitRate: Math.round(this.globalMetrics.cacheHits / Math.max(1, this.globalMetrics.totalQueries) * 100),
      p95Latency: this.calculateP95(chatbotId),
      queriesPerHour: this.calculateQueriesPerHour(chatbotId),
      estAnnualCost: m.embeddingCost * 365
    };
  }

  /**
   * Obtiene métricas globales
   */
  getGlobalMetrics() {
    const totalQueries = Math.max(1, this.globalMetrics.totalQueries);

    return {
      ...this.globalMetrics,
      avgLatency: Math.round(this.globalMetrics.totalLatency / totalQueries),
      hallucintationRate: Math.round((this.globalMetrics.hallucinations / totalQueries) * 100) / 100,
      answeredRate: Math.round((this.globalMetrics.questionsAnswered / totalQueries) * 100) / 100,
      cacheHitRate: Math.round((this.globalMetrics.cacheHits / totalQueries) * 100),
      cacheHitSavings: Math.round(
        (this.globalMetrics.cacheHits * 0.2) / totalQueries * 100
      ) // Asumiendo 200ms saved per hit
    };
  }

  /**
   * Obtiene preguntas no respondidas
   */
  getUnanswereredQuestions(chatbotId, limit = 20) {
    if (!this.metrics.has(chatbotId)) {
      return [];
    }

    const m = this.metrics.get(chatbotId);
    return m.questionsNotAnswered
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  /**
   * Obtiene top queries
   */
  getTopQueries(chatbotId, limit = 20) {
    if (!this.metrics.has(chatbotId)) {
      return [];
    }

    const m = this.metrics.get(chatbotId);
    return m.topQueries.slice(0, limit);
  }

  /**
   * Obtiene queries recientes
   */
  getRecentQueries(chatbotId, limit = 20) {
    if (!this.metrics.has(chatbotId)) {
      return [];
    }

    const m = this.metrics.get(chatbotId);
    return m.recentQueries.slice(-limit).reverse();
  }

  /**
   * Calcula latencia P95
   */
  calculateP95(chatbotId) {
    if (!this.metrics.has(chatbotId)) {
      return 0;
    }

    const m = this.metrics.get(chatbotId);
    const latencies = m.recentQueries.map(q => q.latency).sort((a, b) => a - b);

    if (latencies.length === 0) return 0;

    const index = Math.ceil(latencies.length * 0.95) - 1;
    return latencies[Math.max(0, index)];
  }

  /**
   * Calcula queries por hora
   */
  calculateQueriesPerHour(chatbotId) {
    if (!this.metrics.has(chatbotId)) {
      return 0;
    }

    const m = this.metrics.get(chatbotId);
    if (m.recentQueries.length === 0) return 0;

    const oldestQuery = m.recentQueries[0]?.timestamp;
    const newestQuery = m.recentQueries[m.recentQueries.length - 1]?.timestamp;

    if (!oldestQuery || !newestQuery) return 0;

    const hoursElapsed = (newestQuery - oldestQuery) / (1000 * 60 * 60);
    if (hoursElapsed === 0) return 0;

    return Math.round((m.recentQueries.length / hoursElapsed) * 10) / 10;
  }

  /**
   * Reporte de salud RAG
   */
  getHealthReport(chatbotId) {
    const m = this.getMetrics(chatbotId);

    if (!m || m.error) {
      return { status: 'unknown', message: 'No metrics available' };
    }

    const issues = [];

    if (m.hallucintationRate > 0.05) {
      issues.push(`⚠️ High hallucination rate: ${m.hallucintationRate}`);
    }

    if (m.answeredRate < 0.7) {
      issues.push(`⚠️ Low answer rate: ${m.answeredRate}`);
    }

    if (m.avgLatency > 500) {
      issues.push(`⚠️ High latency: ${m.avgLatency}ms`);
    }

    if (m.cacheHitRate < 20) {
      issues.push(`ℹ️ Low cache hit rate: ${m.cacheHitRate}%`);
    }

    const status = issues.length === 0 ? '✅ healthy' : '⚠️ issues';

    return {
      status,
      issues,
      metrics: {
        answeredRate: m.answeredRate,
        hallucintationRate: m.hallucintationRate,
        avgLatency: m.avgLatency,
        cacheHitRate: m.cacheHitRate,
        totalQueries: m.totalQueries
      }
    };
  }

  /**
   * Exporta métricas (para dashboard)
   */
  export(chatbotId) {
    if (!this.metrics.has(chatbotId)) {
      return null;
    }

    const m = this.metrics.get(chatbotId);
    const health = this.getHealthReport(chatbotId);

    return {
      chatbotId,
      timestamp: new Date(),
      ...m,
      health,
      topQueries: m.topQueries.slice(0, 10),
      recentQueries: m.recentQueries.slice(-10).reverse(),
      questionsNotAnswered: m.questionsNotAnswered.slice(-5)
    };
  }

  /**
   * Reset de métricas (para testing)
   */
  reset(chatbotId) {
    if (chatbotId) {
      this.metrics.delete(chatbotId);
      logger.info('Metrics reset for chatbot', { chatbotId });
    } else {
      this.metrics.clear();
      this.globalMetrics = {
        totalQueries: 0,
        totalLatency: 0,
        embeddingCost: 0,
        cacheHits: 0,
        cacheMisses: 0,
        hallucinations: 0,
        questionsAnswered: 0,
        questionsNotAnswered: 0
      };
      logger.info('All metrics reset');
    }
  }
}

export default new RAGMetricsService();
