import { Workspace, WorkspaceMember, User } from '../../models/index.js';
import WorkspaceInvitation from '../../models/WorkspaceInvitation.js';

export default class WorkspaceService {
    list = async (userId) => {
        try {
            const members = await WorkspaceMember.find({ userId });
            const workspaceIds = members.map(m => m.workspaceId);
            const workspaces = await Workspace.find({ _id: { $in: workspaceIds } });

            return {
                success: true,
                message: 'Workspaces obtenidos',
                data: workspaces
            };
        } catch (error) {
            console.error('❌ WorkspaceService.list:', error);
            return { success: false, message: error.message };
        }
    };

    create = async (userId, name, industry, country) => {
        try {
            const slug = name.toLowerCase().replace(/\s+/g, '-');

            const workspace = new Workspace({
                name,
                slug,
                ownerId: userId,
                industry,
                country,
                plan: 'free'
            });

            await workspace.save();

            await WorkspaceMember.create({
                workspaceId: workspace._id,
                userId,
                role: 'owner',
                status: 'active',
                joinedAt: new Date()
            });

            return {
                success: true,
                message: 'Workspace creado',
                data: workspace
            };
        } catch (error) {
            console.error('❌ WorkspaceService.create:', error);
            return { success: false, message: error.message };
        }
    };

    get = async (workspaceId) => {
        try {
            const workspace = await Workspace.findById(workspaceId);

            if (!workspace) {
                return { success: false, message: 'Workspace no encontrado' };
            }

            return {
                success: true,
                message: 'Workspace obtenido',
                data: workspace
            };
        } catch (error) {
            console.error('❌ WorkspaceService.get:', error);
            return { success: false, message: error.message };
        }
    };

    update = async (workspaceId, updates) => {
        try {
            const allowedFields = ['name', 'logo', 'brandColor', 'industry', 'country'];
            const filteredUpdates = {};

            allowedFields.forEach(field => {
                if (updates[field] !== undefined) filteredUpdates[field] = updates[field];
            });

            const workspace = await Workspace.findByIdAndUpdate(workspaceId, filteredUpdates, { new: true });

            return {
                success: true,
                message: 'Workspace actualizado',
                data: workspace
            };
        } catch (error) {
            console.error('❌ WorkspaceService.update:', error);
            return { success: false, message: error.message };
        }
    };

    delete = async (workspaceId) => {
        try {
            await Workspace.deleteOne({ _id: workspaceId });
            await WorkspaceMember.deleteMany({ workspaceId });

            return { success: true, message: 'Workspace eliminado' };
        } catch (error) {
            console.error('❌ WorkspaceService.delete:', error);
            return { success: false, message: error.message };
        }
    };

    listMembers = async (workspaceId) => {
        try {
            const members = await WorkspaceMember.find({ workspaceId, status: { $ne: 'removed' } })
                .populate('userId', 'email name');
            const pending = await this.listPendingInvitations(workspaceId);

            return {
                success: true,
                data: { members, pending },
            };
        } catch (error) {
            console.error('❌ WorkspaceService.listMembers:', error);
            return { success: false, message: error.message };
        }
    };

    inviteMember = async (workspaceId, invitedByUserId, inviteeEmail, role = 'member') => {
        try {
            const email = inviteeEmail.toLowerCase().trim();

            // If user already exists in Zapien, add directly
            const user = await User.findOne({ email });
            if (user) {
                const existing = await WorkspaceMember.findOne({ workspaceId, userId: user._id });
                if (existing && existing.status !== 'removed') {
                    return { success: false, message: 'Este usuario ya es miembro del workspace' };
                }
                if (existing) {
                    await WorkspaceMember.findByIdAndUpdate(existing._id, { role, status: 'active', joinedAt: new Date() });
                } else {
                    await WorkspaceMember.create({ workspaceId, userId: user._id, role, status: 'active', invitedBy: invitedByUserId, joinedAt: new Date() });
                }
                return { success: true, message: `${user.name || email} añadido al workspace` };
            }

            // No account yet — create invitation with token
            const existingInvite = await WorkspaceInvitation.findOne({ workspaceId, email, status: 'pending' });
            if (existingInvite) {
                return { success: false, message: 'Ya hay una invitación pendiente para ese email' };
            }

            const token = WorkspaceInvitation.generateToken();
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
            await WorkspaceInvitation.create({ workspaceId, email, role, token, invitedBy: invitedByUserId, expiresAt });

            // Send invitation email
            const workspace = await Workspace.findById(workspaceId).select('name');
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            const inviteUrl = `${frontendUrl}/invitar?token=${token}`;
            const emailService = (await import('../notifications/email.service.js')).default;
            await emailService.sendInvitation({ email, workspaceName: workspace?.name || 'Zapien', role, inviteUrl });

            return { success: true, message: `Invitación enviada a ${email}` };
        } catch (error) {
            console.error('❌ WorkspaceService.inviteMember:', error);
            return { success: false, message: error.message };
        }
    };

    // Fetch pending invitations for a workspace
    listPendingInvitations = async (workspaceId) => {
        const invitations = await WorkspaceInvitation.find({ workspaceId, status: 'pending', expiresAt: { $gt: new Date() } })
            .select('email role createdAt expiresAt').sort({ createdAt: -1 });
        return invitations;
    };

    // Accept invitation by token (called on signup/login)
    acceptInvitation = async (token, userId) => {
        try {
            const invitation = await WorkspaceInvitation.findOne({ token, status: 'pending', expiresAt: { $gt: new Date() } });
            if (!invitation) return { success: false, message: 'Invitación inválida o expirada' };

            const existing = await WorkspaceMember.findOne({ workspaceId: invitation.workspaceId, userId });
            if (!existing) {
                await WorkspaceMember.create({ workspaceId: invitation.workspaceId, userId, role: invitation.role, status: 'active', joinedAt: new Date() });
            }

            await WorkspaceInvitation.findByIdAndUpdate(invitation._id, { status: 'accepted' });
            return { success: true, workspaceId: invitation.workspaceId, role: invitation.role };
        } catch (error) {
            return { success: false, message: error.message };
        }
    };

    updateMemberRole = async (workspaceId, userId, newRole) => {
        try {
            const member = await WorkspaceMember.findOneAndUpdate(
                { workspaceId, userId },
                { role: newRole },
                { new: true }
            );

            return {
                success: true,
                message: 'Rol actualizado',
                data: member
            };
        } catch (error) {
            console.error('❌ WorkspaceService.updateMemberRole:', error);
            return { success: false, message: error.message };
        }
    };

    removeMember = async (workspaceId, userId) => {
        try {
            await WorkspaceMember.deleteOne({ workspaceId, userId });

            return { success: true, message: 'Miembro removido' };
        } catch (error) {
            console.error('❌ WorkspaceService.removeMember:', error);
            return { success: false, message: error.message };
        }
    };
}
