import { WorkspaceMember } from '../models/index.js';

const ROLE_HIERARCHY = { owner: 3, admin: 2, member: 1 };

/**
 * Returns middleware that checks the user has at least the required role in the workspace.
 * Workspace ID is read from req.params (workspaceId, wsId, id) or req.body.workspaceId.
 */
export const requireRole = (minRole) => async (req, res, next) => {
  try {
    const workspaceId =
      req.params.workspaceId ||
      req.params.wsId ||
      req.params.id ||
      req.body?.workspaceId;

    if (!workspaceId) return next(); // No workspace context — skip (public or non-workspace route)

    const membership = await WorkspaceMember.findOne({
      workspaceId,
      userId: req.user.userId,
      status: { $ne: 'removed' },
    });

    if (!membership) {
      return res.status(403).json({ success: false, message: 'No tienes acceso a este workspace' });
    }

    const userLevel = ROLE_HIERARCHY[membership.role] || 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] || 0;

    if (userLevel < requiredLevel) {
      return res.status(403).json({
        success: false,
        message: `Se requiere rol "${minRole}" o superior para esta acción`,
      });
    }

    req.workspaceMember = membership;
    req.workspaceRole = membership.role;
    next();
  } catch (error) {
    console.error('❌ Role middleware:', error);
    res.status(500).json({ success: false, message: 'Error verificando permisos' });
  }
};

export const requireAdmin = requireRole('admin');
export const requireOwner = requireRole('owner');
export const requireMember = requireRole('member'); // any workspace member
