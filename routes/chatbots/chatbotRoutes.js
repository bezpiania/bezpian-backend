import express from 'express';
import ChatbotController from '../../controllers/chatbots/chatbot.controller.js';
import DocumentRoutes from '../documents/documentRoutes.js';
import ConversationRoutes from '../conversations/conversationRoutes.js';
import ProductRoutes from '../products/productRoutes.js';
import ConfigRoutes from '../config.routes.js';
import LeadsRoutes from './leads.routes.js';
import QuotesRoutes from './quotes.routes.js';
import AppointmentsRoutes from './appointments.routes.js';
import { requireAdmin, requireMember } from '../../middlewares/role.middleware.js';

const router = express.Router({ mergeParams: true });
const chatbotController = new ChatbotController();

// Read — any workspace member
router.get('/', requireMember, chatbotController.list);
router.get('/:id', requireMember, chatbotController.get);
router.get('/:id/embed-code', requireMember, chatbotController.getEmbedCode);
router.get('/:id/stats', requireMember, chatbotController.getStats);
router.get('/:id/openai-config', requireMember, chatbotController.getOpenaiConfig);

// Write — admin only
router.post('/', requireAdmin, chatbotController.create);
router.patch('/:id', requireAdmin, chatbotController.update);
router.delete('/:id', requireAdmin, chatbotController.delete);
router.post('/:id/activate', requireAdmin, chatbotController.activate);
router.post('/:id/pause', requireAdmin, chatbotController.pause);
router.patch('/:id/openai-config', requireAdmin, chatbotController.updateOpenaiConfig);
router.patch('/:id/google-oauth', requireAdmin, chatbotController.updateGoogleOAuthConfig);
router.get('/:id/calendar/auth-url', requireAdmin, chatbotController.getCalendarAuthUrl);

// Nested
router.use('/:id/documents', DocumentRoutes);
router.use('/:id/conversations', requireMember, ConversationRoutes);
router.use('/:id/products', requireMember, ProductRoutes);
router.use('/:id/config', requireMember, ConfigRoutes);
router.use('/:id/leads', requireMember, LeadsRoutes);
router.use('/:id/quotes', requireMember, QuotesRoutes);
router.use('/:id/appointments', requireMember, AppointmentsRoutes);

export default router;
