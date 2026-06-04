import ChatbotConfigService from '../../services/config/chatbot-config.service.js';
import logger from '../../utils/logger.js';

class ChatbotConfigController {
  /**
   * GET /api/chatbots/:chatbotId/config
   * Obtener configuración (empresa + instrucciones)
   */
  getConfig = async (req, res, next) => {
    try {
      const { id: chatbotId, workspaceId } = req.params;

      if (!workspaceId || !chatbotId) {
        return res.status(400).json({
          success: false,
          message: 'Parámetros requeridos: workspaceId, chatbotId'
        });
      }

      const result = await ChatbotConfigService.getConfig(workspaceId, chatbotId);
      return res.status(200).json(result);
    } catch (error) {
      logger.error('Error getting config:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al obtener configuración'
      });
    }
  };

  /**
   * POST /api/chatbots/:chatbotId/config
   * Guardar configuración (empresa + instrucciones)
   */
  saveConfig = async (req, res, next) => {
    try {
      const { id: chatbotId, workspaceId } = req.params;
      const { company, instructions } = req.body;

      if (!workspaceId || !chatbotId) {
        return res.status(400).json({
          success: false,
          message: 'Parámetros requeridos: workspaceId, chatbotId'
        });
      }

      // Guardar información de empresa
      if (company) {
        await ChatbotConfigService.saveCompanyInfo(workspaceId, company, chatbotId);
      }

      // Guardar instrucciones
      if (instructions) {
        await ChatbotConfigService.saveInstructions(chatbotId, instructions);
      }

      // Retornar configuración actualizada
      const result = await ChatbotConfigService.getConfig(workspaceId, chatbotId);
      return res.status(200).json(result);
    } catch (error) {
      logger.error('Error saving config:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al guardar configuración'
      });
    }
  };

  /**
   * GET /api/chatbots/:chatbotId/system-prompt
   * Obtener system prompt construido
   */
  getSystemPrompt = async (req, res, next) => {
    try {
      const { id: chatbotId, workspaceId } = req.params;

      if (!workspaceId || !chatbotId) {
        return res.status(400).json({
          success: false,
          message: 'Parámetros requeridos: workspaceId, chatbotId'
        });
      }

      const systemPrompt = await ChatbotConfigService.buildSystemPrompt(
        workspaceId,
        chatbotId
      );

      return res.status(200).json({
        success: true,
        data: { systemPrompt }
      });
    } catch (error) {
      logger.error('Error getting system prompt:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al obtener prompt'
      });
    }
  };
}

export default new ChatbotConfigController();
