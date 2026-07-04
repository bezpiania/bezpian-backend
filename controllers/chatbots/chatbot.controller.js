import ChatbotService from '../../services/chatbots/chatbot.service.js';
import calendarService from '../../services/calendar/calendar.service.js';
import { validateRequired, validateMongoId } from '../../middlewares/validation.middleware.js';

const chatbotService = new ChatbotService();

export default class ChatbotController {
    list = async (req, res) => {
        try {
            const { workspaceId } = req.params;

            if (!validateMongoId(workspaceId)) {
                return res.status(400).json({
                    success: false,
                    message: 'ID de workspace inválido'
                });
            }

            const response = await chatbotService.list(workspaceId);
            // Cliente final: solo puede ver su propio bot scopeado, no los del resto.
            if (response.success && req.user?.role === 'client' && req.user.scopedChatbotId) {
                response.data = (response.data || []).filter(b => b._id?.toString() === req.user.scopedChatbotId);
            }
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ ChatbotController.list:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al listar chatbots'
            });
        }
    };

    create = async (req, res) => {
        try {
            const { workspaceId } = req.params;
            const chatbotData = req.body;

            if (!validateMongoId(workspaceId)) {
                return res.status(400).json({
                    success: false,
                    message: 'ID de workspace inválido'
                });
            }

            const missing = validateRequired(['botName'], { botName: chatbotData.botName });
            if (missing) {
                return res.status(400).json({
                    success: false,
                    message: `Campos requeridos: ${missing.join(', ')}`
                });
            }

            const response = await chatbotService.create(workspaceId, chatbotData);
            return res.status(response.success ? 201 : 400).json(response);
        } catch (error) {
            console.error('❌ ChatbotController.create:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al crear chatbot'
            });
        }
    };

    get = async (req, res) => {
        try {
            const { id } = req.params;
            // Cliente final: solo puede consultar su bot scopeado.
            if (req.user?.role === 'client' && req.user.scopedChatbotId && id !== req.user.scopedChatbotId) {
                return res.status(403).json({ success: false, message: 'No autorizado' });
            }
            const response = await chatbotService.get(id);
            return res.status(response.success ? 200 : 404).json(response);
        } catch (error) {
            console.error('❌ ChatbotController.get:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al obtener chatbot'
            });
        }
    };

    update = async (req, res) => {
        try {
            const { id } = req.params;
            const response = await chatbotService.update(id, req.body);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ ChatbotController.update:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al actualizar chatbot'
            });
        }
    };

    delete = async (req, res) => {
        try {
            const { id } = req.params;
            const response = await chatbotService.delete(id);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ ChatbotController.delete:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al eliminar chatbot'
            });
        }
    };

    activate = async (req, res) => {
        try {
            const { id } = req.params;
            const response = await chatbotService.activate(id);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ ChatbotController.activate:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al activar chatbot'
            });
        }
    };

    pause = async (req, res) => {
        try {
            const { id } = req.params;
            const response = await chatbotService.pause(id);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ ChatbotController.pause:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al pausar chatbot'
            });
        }
    };

    getEmbedCode = async (req, res) => {
        try {
            const { id } = req.params;
            const response = await chatbotService.getEmbedCode(id);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ ChatbotController.getEmbedCode:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al obtener embed code'
            });
        }
    };

    getStats = async (req, res) => {
        try {
            const { id } = req.params;
            const response = await chatbotService.getStats(id);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ ChatbotController.getStats:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al obtener stats'
            });
        }
    };

    updateOpenaiConfig = async (req, res) => {
        try {
            const { id } = req.params;
            const { openaiApiKey, openaiModel, openaiSettings } = req.body;

            const response = await chatbotService.updateOpenaiConfig(id, {
                openaiApiKey,
                openaiModel,
                openaiSettings
            });
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ ChatbotController.updateOpenaiConfig:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al actualizar configuración OpenAI'
            });
        }
    };

    getOpenaiConfig = async (req, res) => {
        try {
            const { id } = req.params;
            console.log('🔵 ChatbotController.getOpenaiConfig called with id:', id);
            const response = await chatbotService.getOpenaiConfig(id);
            console.log('✅ Service returned:', JSON.stringify(response, null, 2));
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ ChatbotController.getOpenaiConfig:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al obtener configuración OpenAI'
            });
        }
    };

    updateGoogleOAuthConfig = async (req, res) => {
        try {
            const { id } = req.params;
            const { googleClientId, googleClientSecret } = req.body;

            if (!validateMongoId(id)) {
                return res.status(400).json({
                    success: false,
                    message: 'ID de chatbot inválido'
                });
            }

            if (!googleClientId || !googleClientSecret) {
                return res.status(400).json({
                    success: false,
                    message: 'Google Client ID y Client Secret son requeridos'
                });
            }

            const response = await chatbotService.update(id, {
                integrations: {
                    calendar: {
                        googleClientId,
                        googleClientSecret
                    }
                }
            });

            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ ChatbotController.updateGoogleOAuthConfig:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al actualizar configuración de Google OAuth'
            });
        }
    };

    getCalendarAuthUrl = async (req, res) => {
        try {
            const { id, workspaceId } = req.params;

            if (!validateMongoId(id)) {
                return res.status(400).json({
                    success: false,
                    message: 'ID de chatbot inválido'
                });
            }

            // Obtener el chatbot para verificar que tiene credenciales configuradas
            const chatbot = await chatbotService.get(id);
            if (!chatbot.success) {
                return res.status(404).json({
                    success: false,
                    message: 'Chatbot no encontrado'
                });
            }

            const googleClientId = chatbot.data.integrations?.calendar?.googleClientId;
            const googleClientSecret = chatbot.data.integrations?.calendar?.googleClientSecret;

            if (!googleClientId || !googleClientSecret) {
                return res.status(400).json({
                    success: false,
                    message: 'Credenciales de Google no configuradas. Por favor, agrega tu Google Client ID y Client Secret en la configuración del bot.'
                });
            }

            const redirectUri = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/google/callback`;
            const authUrl = calendarService.getAuthorizationUrl(id, redirectUri, googleClientId, googleClientSecret);

            return res.status(200).json({
                success: true,
                data: { authUrl }
            });
        } catch (error) {
            console.error('❌ ChatbotController.getCalendarAuthUrl:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Error al obtener URL de autenticación'
            });
        }
    };
}
