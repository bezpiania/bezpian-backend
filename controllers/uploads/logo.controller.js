import logoService from '../../services/uploads/logo.service.js';
import logger from '../../utils/logger.js';

export default class LogoController {
  /**
   * POST /api/uploads/logo
   * Body (multipart): logo=<archivo>, chatbotId=<id>
   * Sube el logo a Cloudinary (500x500) y devuelve la URL para guardar en la config.
   */
  upload = async (req, res) => {
    try {
      const file = req.files?.logo;
      const { chatbotId } = req.body;

      if (!chatbotId) {
        return res.status(400).json({ success: false, message: 'chatbotId es requerido' });
      }
      if (!file) {
        return res.status(400).json({ success: false, message: 'No se recibió ningún archivo (campo "logo")' });
      }

      const result = await logoService.uploadLogo(chatbotId, file);
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      logger.error('Error subiendo logo:', error);
      return res.status(400).json({ success: false, message: error.message || 'Error al subir el logo' });
    }
  };
}
