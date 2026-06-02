import express from 'express';
import WorkspaceController from '../../controllers/workspaces/workspace.controller.js';
import ChatbotRoutes from '../chatbots/chatbotRoutes.js';
import LeadRoutes from '../leads/leadRoutes.js';
import AppointmentRoutes from '../appointments/appointmentRoutes.js';
import QuoteRoutes from '../quotes/quoteRoutes.js';
import IntegrationRoutes from '../integrations/integrationRoutes.js';
import { requireAdmin, requireOwner, requireMember } from '../../middlewares/role.middleware.js';
import { checkMemberLimit } from '../../middlewares/planLimits.middleware.js';

const router = express.Router();
const workspaceController = new WorkspaceController();

// Workspace CRUD
router.get('/', workspaceController.list);
router.post('/', workspaceController.create);
router.get('/:id', requireMember, workspaceController.get);
router.patch('/:id', requireAdmin, workspaceController.update);
router.delete('/:id', requireOwner, workspaceController.delete);

// Members — admin to manage, any member to list
router.get('/:id/members', requireMember, workspaceController.listMembers);
router.post('/:id/members', requireAdmin, checkMemberLimit, workspaceController.createMember);
router.put('/:id/members/:userId', requireAdmin, workspaceController.updateMemberInfo);
router.post('/:id/invite', requireAdmin, workspaceController.inviteMember);
router.patch('/:id/members/:userId', requireAdmin, workspaceController.updateMemberRole);
router.delete('/:id/members/:userId', requireAdmin, workspaceController.removeMember);

// Nested routes — read-only for members, write requires admin
router.use('/:workspaceId/chatbots', ChatbotRoutes);      // chatbot routes handle own perms
router.use('/:workspaceId/leads', requireMember, LeadRoutes);
router.use('/:workspaceId/appointments', requireMember, AppointmentRoutes);
router.use('/:workspaceId/quotes', requireMember, QuoteRoutes);
router.use('/:workspaceId/integrations', requireAdmin, IntegrationRoutes);

export default router;
