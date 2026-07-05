import { Workspace, WorkspaceMember, User } from '../../models/index.js';
import WorkspaceInvitation from '../../models/WorkspaceInvitation.js';
import Chatbot from '../../models/Chatbot.js';
import Conversation from '../../models/Conversation.js';
import Lead from '../../models/Lead.js';
import Quote from '../../models/Quote.js';

export default class WorkspaceService {
    getCounts = async (workspaceId, chatbotId = null) => {
        try {
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const botFilter = chatbotId ? { chatbotId } : {};

            const [chatbots, conversations, leads, quotes] = await Promise.all([
                Chatbot.countDocuments({ workspaceId }),
                Conversation.countDocuments({ workspaceId, ...botFilter, createdAt: { $gte: monthStart } }),
                Lead.countDocuments({ workspaceId, ...botFilter, createdAt: { $gte: monthStart } }),
                Quote.countDocuments({ workspaceId, ...botFilter, createdAt: { $gte: monthStart } }),
            ]);

            return {
                success: true,
                data: { chatbots, conversations, leads, quotes },
            };
        } catch (error) {
            console.error('❌ WorkspaceService.getCounts:', error);
            return { success: false, message: error.message };
        }
    };

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

    createMember = async (workspaceId, invitedByUserId, { name, email, password, role = 'member', scopedChatbotId = null }) => {
        try {
            const normalizedEmail = email.toLowerCase().trim();
            let user = await User.findOne({ email: normalizedEmail });

            if (user) {
                // User exists — just add to workspace if not already a member
                const existing = await WorkspaceMember.findOne({ workspaceId, userId: user._id });
                if (existing && existing.status !== 'removed') {
                    return { success: false, message: 'Este usuario ya es miembro del workspace' };
                }
                if (existing) {
                    await WorkspaceMember.findByIdAndUpdate(existing._id, { role, scopedChatbotId, status: 'active', joinedAt: new Date() });
                } else {
                    await WorkspaceMember.create({ workspaceId, userId: user._id, role, scopedChatbotId, status: 'active', invitedBy: invitedByUserId, joinedAt: new Date() });
                }
                // Cliente: su workspace por defecto es este (entra directo a su bot).
                if (role === 'client') { user.defaultWorkspaceId = workspaceId; await user.save(); }
                return { success: true, message: `${user.name} añadido al workspace` };
            }

            // Create new user account
            const bcrypt = (await import('bcrypt')).default;
            const passwordHash = await bcrypt.hash(password, 10);
            user = await User.create({
                email: normalizedEmail,
                passwordHash,
                name: name || normalizedEmail.split('@')[0],
                emailVerified: true, // admin-created accounts skip verification
                // Fija el workspace del que se le da acceso (evita que el login le cree
                // uno nuevo vacío y lo trate como owner). Clave para el rol 'client'.
                defaultWorkspaceId: workspaceId,
            });

            await WorkspaceMember.create({
                workspaceId,
                userId: user._id,
                role,
                scopedChatbotId,
                status: 'active',
                invitedBy: invitedByUserId,
                joinedAt: new Date(),
            });

            return { success: true, message: 'Usuario creado y añadido al workspace', data: { userId: user._id, email: user.email } };
        } catch (error) {
            console.error('❌ WorkspaceService.createMember:', error);
            return { success: false, message: error.message };
        }
    };

    inviteMember = async (workspaceId, invitedByUserId, inviteeEmail, role = 'member') => {
        try {
            const email = inviteeEmail.toLowerCase().trim();

            // If user already exists in Pielo, add directly
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
            await emailService.sendInvitation({ email, workspaceName: workspace?.name || 'Pielo', role, inviteUrl });

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
            return { success: true, message: 'Rol actualizado', data: member };
        } catch (error) {
            console.error('❌ WorkspaceService.updateMemberRole:', error);
            return { success: false, message: error.message };
        }
    };

    updateMemberInfo = async (workspaceId, userId, { name, email, password }) => {
        try {
            const updates = {};
            if (name) updates.name = name;
            if (email) updates.email = email.toLowerCase().trim();
            if (password) {
                const bcrypt = (await import('bcrypt')).default;
                updates.passwordHash = await bcrypt.hash(password, 10);
            }
            if (!Object.keys(updates).length) return { success: false, message: 'Nada que actualizar' };

            await User.findByIdAndUpdate(userId, updates);
            return { success: true, message: 'Usuario actualizado' };
        } catch (error) {
            console.error('❌ WorkspaceService.updateMemberInfo:', error);
            return { success: false, message: error.message };
        }
    };

    removeMember = async (workspaceId, userId) => {
        try {
            await WorkspaceMember.deleteOne({ workspaceId, userId });
            return { success: true, message: 'Miembro eliminado' };
        } catch (error) {
            console.error('❌ WorkspaceService.removeMember:', error);
            return { success: false, message: error.message };
        }
    };
}
