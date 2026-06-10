/**
 * requireFeature(featureName)
 *
 * Middleware factory that blocks the request if the chatbot doesn't have the
 * given feature enabled. Expects the chatbot ID in req.params.id (or cbId).
 *
 * Usage:
 *   router.post('/', requireFeature('sales'), ordersController.create);
 */

import Chatbot from '../models/Chatbot.js';

export const requireFeature = (featureName) => async (req, res, next) => {
  try {
    const chatbotId = req.params.id || req.params.cbId;
    if (!chatbotId) return next(); // no chatbot context → let downstream handle it

    const chatbot = await Chatbot.findById(chatbotId).select('features').lean();
    if (!chatbot) return res.status(404).json({ success: false, message: 'Chatbot no encontrado' });

    if (!chatbot.features?.[featureName]) {
      return res.status(403).json({
        success: false,
        message: `La funcionalidad "${featureName}" no está habilitada para este chatbot.`,
        feature: featureName,
      });
    }

    next();
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
