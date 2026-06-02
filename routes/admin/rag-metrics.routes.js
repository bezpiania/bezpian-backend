import express from 'express';
import RAGMetrics from '../../services/monitoring/rag-metrics.service.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// Middleware: solo admins
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
};

router.use(authMiddleware);
router.use(adminOnly);

/**
 * GET /admin/rag/metrics?chatbotId=xxx
 * Obtiene métricas de un chatbot específico
 */
router.get('/metrics', (req, res) => {
  try {
    const { chatbotId } = req.query;

    if (!chatbotId) {
      return res.status(400).json({
        success: false,
        message: 'chatbotId is required'
      });
    }

    const metrics = RAGMetrics.getMetrics(chatbotId);

    logger.info('RAG metrics retrieved', { chatbotId });

    return res.status(200).json({
      success: true,
      data: metrics
    });
  } catch (error) {
    logger.error('Error getting RAG metrics', { error: error.message });
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /admin/rag/health?chatbotId=xxx
 * Obtiene reporte de salud RAG
 */
router.get('/health', (req, res) => {
  try {
    const { chatbotId } = req.query;

    if (!chatbotId) {
      return res.status(400).json({
        success: false,
        message: 'chatbotId is required'
      });
    }

    const health = RAGMetrics.getHealthReport(chatbotId);

    logger.info('RAG health report retrieved', { chatbotId, status: health.status });

    return res.status(200).json({
      success: true,
      data: health
    });
  } catch (error) {
    logger.error('Error getting RAG health', { error: error.message });
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /admin/rag/top-queries?chatbotId=xxx&limit=20
 * Obtiene top queries
 */
router.get('/top-queries', (req, res) => {
  try {
    const { chatbotId, limit = 20 } = req.query;

    if (!chatbotId) {
      return res.status(400).json({
        success: false,
        message: 'chatbotId is required'
      });
    }

    const queries = RAGMetrics.getTopQueries(chatbotId, parseInt(limit));

    logger.info('Top queries retrieved', { chatbotId, count: queries.length });

    return res.status(200).json({
      success: true,
      data: queries
    });
  } catch (error) {
    logger.error('Error getting top queries', { error: error.message });
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /admin/rag/unanswered?chatbotId=xxx&limit=20
 * Obtiene preguntas no respondidas
 */
router.get('/unanswered', (req, res) => {
  try {
    const { chatbotId, limit = 20 } = req.query;

    if (!chatbotId) {
      return res.status(400).json({
        success: false,
        message: 'chatbotId is required'
      });
    }

    const unanswered = RAGMetrics.getUnanswereredQuestions(chatbotId, parseInt(limit));

    logger.info('Unanswered questions retrieved', {
      chatbotId,
      count: unanswered.length
    });

    return res.status(200).json({
      success: true,
      data: unanswered
    });
  } catch (error) {
    logger.error('Error getting unanswered questions', { error: error.message });
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /admin/rag/recent?chatbotId=xxx&limit=20
 * Obtiene queries recientes
 */
router.get('/recent', (req, res) => {
  try {
    const { chatbotId, limit = 20 } = req.query;

    if (!chatbotId) {
      return res.status(400).json({
        success: false,
        message: 'chatbotId is required'
      });
    }

    const recent = RAGMetrics.getRecentQueries(chatbotId, parseInt(limit));

    logger.info('Recent queries retrieved', { chatbotId, count: recent.length });

    return res.status(200).json({
      success: true,
      data: recent
    });
  } catch (error) {
    logger.error('Error getting recent queries', { error: error.message });
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /admin/rag/global
 * Obtiene métricas globales de todos los chatbots
 */
router.get('/global', (req, res) => {
  try {
    const global = RAGMetrics.getGlobalMetrics();

    logger.info('Global RAG metrics retrieved');

    return res.status(200).json({
      success: true,
      data: global
    });
  } catch (error) {
    logger.error('Error getting global metrics', { error: error.message });
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /admin/rag/export?chatbotId=xxx
 * Exporta métricas completas (para dashboard)
 */
router.get('/export', (req, res) => {
  try {
    const { chatbotId } = req.query;

    if (!chatbotId) {
      return res.status(400).json({
        success: false,
        message: 'chatbotId is required'
      });
    }

    const exported = RAGMetrics.export(chatbotId);

    if (!exported) {
      return res.status(404).json({
        success: false,
        message: 'No metrics found for chatbot'
      });
    }

    logger.info('RAG metrics exported', { chatbotId });

    return res.status(200).json({
      success: true,
      data: exported
    });
  } catch (error) {
    logger.error('Error exporting metrics', { error: error.message });
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /admin/rag/reset?chatbotId=xxx
 * Reseta métricas (admin only)
 */
router.post('/reset', (req, res) => {
  try {
    const { chatbotId } = req.query;

    RAGMetrics.reset(chatbotId);

    logger.warn('RAG metrics reset', { chatbotId, resetBy: req.user?.email });

    return res.status(200).json({
      success: true,
      message: chatbotId ? `Metrics reset for chatbot ${chatbotId}` : 'All metrics reset'
    });
  } catch (error) {
    logger.error('Error resetting metrics', { error: error.message });
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
