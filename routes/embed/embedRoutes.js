import express from 'express';
import EmbedController from '../../controllers/embed/embed.controller.js';
import rateLimiter from '../../middlewares/rateLimit.middleware.js';

const router = express.Router();
const embedController = new EmbedController();

// Public endpoints (validados por embedKey, sin auth)
router.post('/conversations', rateLimiter.middleware, embedController.startConversation);
router.post('/messages', rateLimiter.middleware, embedController.sendMessage);
// router.post('/lead', rateLimiter.middleware, embedController.captureLead); // leads desactivado temporalmente
router.post('/quote', rateLimiter.middleware, embedController.requestQuote);
router.post('/appointment', rateLimiter.middleware, embedController.requestAppointment);
router.get('/availability', rateLimiter.middleware, embedController.getAvailability);
router.get('/available-dates', rateLimiter.middleware, embedController.getAvailableDates);
router.get('/table/:tableToken', rateLimiter.middleware, embedController.getTableInfo);
router.get('/products', rateLimiter.middleware, embedController.searchProducts);
router.get('/quote-fields', rateLimiter.middleware, embedController.getQuoteFields);
router.get('/bot-info',    rateLimiter.middleware, embedController.getBotInfo);

export default router;
