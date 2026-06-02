import { Router } from 'express';
import WorkspaceInvitation from '../../models/WorkspaceInvitation.js';
import workspaceService from '../../services/workspaces/workspace.service.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';

const router = Router();

// Public: get invitation details by token
router.get('/:token', async (req, res) => {
  try {
    const invitation = await WorkspaceInvitation.findOne({
      token: req.params.token,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    }).populate('workspaceId', 'name');

    if (!invitation) return res.status(404).json({ success: false, message: 'Invitación inválida o expirada' });

    res.json({
      success: true,
      data: {
        email: invitation.email,
        role: invitation.role,
        workspaceName: invitation.workspaceId?.name || 'Zapien',
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Protected: accept invitation (called after login/signup)
router.post('/:token/accept', authMiddleware, async (req, res) => {
  try {
    const result = await workspaceService.acceptInvitation(req.params.token, req.user.userId);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
