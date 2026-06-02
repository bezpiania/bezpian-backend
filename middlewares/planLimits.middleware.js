import { Workspace, WorkspaceMember } from '../models/index.js';
import Chatbot from '../models/Chatbot.js';

const PLAN_LIMITS = {
    free:       { chatbots: 1,  members: 2  },
    starter:    { chatbots: 1,  members: 2  },
    pro:        { chatbots: 3,  members: 10 },
    enterprise: { chatbots: -1, members: -1 },
};

const getWorkspaceId = (req) =>
    req.params.workspaceId || req.params.wsId || req.params.id || req.body?.workspaceId;

/**
 * Checks if the workspace can create a new chatbot based on its plan.
 */
export const checkChatbotLimit = async (req, res, next) => {
    try {
        const workspaceId = getWorkspaceId(req);
        if (!workspaceId) return next();

        const workspace = await Workspace.findById(workspaceId).select('plan');
        const limits = PLAN_LIMITS[workspace?.plan || 'free'];
        if (limits.chatbots === -1) return next(); // unlimited

        const count = await Chatbot.countDocuments({ workspaceId, status: { $ne: 'deleted' } });
        if (count >= limits.chatbots) {
            return res.status(403).json({
                success: false,
                message: `Tu plan ${workspace.plan} permite máximo ${limits.chatbots} chatbot${limits.chatbots !== 1 ? 's' : ''}. Actualiza tu plan para crear más.`,
                code: 'PLAN_LIMIT_CHATBOTS',
            });
        }
        next();
    } catch (error) {
        console.error('❌ checkChatbotLimit:', error);
        next();
    }
};

/**
 * Checks if the workspace can add a new member based on its plan.
 */
export const checkMemberLimit = async (req, res, next) => {
    try {
        const workspaceId = getWorkspaceId(req);
        if (!workspaceId) return next();

        const workspace = await Workspace.findById(workspaceId).select('plan');
        const limits = PLAN_LIMITS[workspace?.plan || 'free'];
        if (limits.members === -1) return next(); // unlimited

        const count = await WorkspaceMember.countDocuments({ workspaceId, status: { $ne: 'removed' } });
        if (count >= limits.members) {
            return res.status(403).json({
                success: false,
                message: `Tu plan ${workspace.plan} permite máximo ${limits.members} miembro${limits.members !== 1 ? 's' : ''}. Actualiza tu plan para agregar más.`,
                code: 'PLAN_LIMIT_MEMBERS',
            });
        }
        next();
    } catch (error) {
        console.error('❌ checkMemberLimit:', error);
        next();
    }
};
