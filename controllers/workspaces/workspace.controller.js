import WorkspaceService from '../../services/workspaces/workspace.service.js';
import { validateRequired, validateMongoId, validateEmail } from '../../middlewares/validation.middleware.js';

const workspaceService = new WorkspaceService();

export default class WorkspaceController {
    list = async (req, res) => {
        try {
            const { userId } = req.user;
            const response = await workspaceService.listWorkspaces(userId);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ WorkspaceController.list:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al listar workspaces'
            });
        }
    };

    create = async (req, res) => {
        try {
            const { userId } = req.user;
            const { name, industry, country } = req.body;

            const missing = validateRequired(['name'], { name });
            if (missing) {
                return res.status(400).json({
                    success: false,
                    message: `Campos requeridos: ${missing.join(', ')}`
                });
            }

            const response = await workspaceService.createWorkspace(userId, name, industry, country);
            return res.status(response.success ? 201 : 400).json(response);
        } catch (error) {
            console.error('❌ WorkspaceController.create:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al crear workspace'
            });
        }
    };

    get = async (req, res) => {
        try {
            const { userId } = req.user;
            const { id } = req.params;
            const response = await workspaceService.getWorkspace(id, userId);
            return res.status(response.success ? 200 : 404).json(response);
        } catch (error) {
            console.error('❌ WorkspaceController.get:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al obtener workspace'
            });
        }
    };

    update = async (req, res) => {
        try {
            const { userId } = req.user;
            const { id } = req.params;
            const response = await workspaceService.updateWorkspace(id, userId, req.body);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ WorkspaceController.update:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al actualizar workspace'
            });
        }
    };

    delete = async (req, res) => {
        try {
            const { userId } = req.user;
            const { id } = req.params;
            const response = await workspaceService.deleteWorkspace(id, userId);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ WorkspaceController.delete:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al eliminar workspace'
            });
        }
    };

    listMembers = async (req, res) => {
        try {
            const { userId } = req.user;
            const { id } = req.params;
            const response = await workspaceService.listMembers(id, userId);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ WorkspaceController.listMembers:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al listar miembros'
            });
        }
    };

    createMember = async (req, res) => {
        try {
            const { userId } = req.user;
            const { id } = req.params;
            const { name, email, password, role } = req.body;
            if (!email || !password) return res.status(400).json({ success: false, message: 'Email y contraseña son requeridos' });
            const response = await workspaceService.createMember(id, userId, { name, email, password, role });
            return res.status(response.success ? 201 : 400).json(response);
        } catch (error) {
            console.error('❌ WorkspaceController.createMember:', error);
            return res.status(500).json({ success: false, message: 'Error al crear miembro' });
        }
    };

    updateMemberInfo = async (req, res) => {
        try {
            const { id, userId: memberId } = req.params;
            const { name, email, password } = req.body;
            const response = await workspaceService.updateMemberInfo(id, memberId, { name, email, password });
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error al actualizar miembro' });
        }
    };

    inviteMember = async (req, res) => {
        try {
            const { userId } = req.user;
            const { id } = req.params;
            const { email, role } = req.body;

            if (!validateMongoId(id)) {
                return res.status(400).json({
                    success: false,
                    message: 'ID de workspace inválido'
                });
            }

            const missing = validateRequired(['email', 'role'], { email, role });
            if (missing) {
                return res.status(400).json({
                    success: false,
                    message: `Campos requeridos: ${missing.join(', ')}`
                });
            }

            if (!validateEmail(email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Email inválido'
                });
            }

            const validRoles = ['owner', 'admin', 'member'];
            if (!validRoles.includes(role)) {
                return res.status(400).json({
                    success: false,
                    message: `Rol inválido. Debe ser uno de: ${validRoles.join(', ')}`
                });
            }

            const response = await workspaceService.inviteMember(id, userId, email, role);
            return res.status(response.success ? 201 : 400).json(response);
        } catch (error) {
            console.error('❌ WorkspaceController.inviteMember:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al invitar miembro'
            });
        }
    };

    updateMemberRole = async (req, res) => {
        try {
            const { userId } = req.user;
            const { id, userId: memberId } = req.params;
            const { role } = req.body;
            const response = await workspaceService.updateMemberRole(id, userId, memberId, role);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ WorkspaceController.updateMemberRole:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al actualizar rol'
            });
        }
    };

    removeMember = async (req, res) => {
        try {
            const { userId } = req.user;
            const { id, userId: memberId } = req.params;
            const response = await workspaceService.removeMember(id, userId, memberId);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ WorkspaceController.removeMember:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al remover miembro'
            });
        }
    };
}
