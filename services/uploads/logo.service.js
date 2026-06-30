import cloudinary, { isCloudinaryConfigured } from '../../libs/cloudinary.js';
import logger from '../../utils/logger.js';

const FOLDER = 'chatbot-logos';
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];

/**
 * Sube el logo de un chatbot a Cloudinary, forzando un cuadrado de 500x500 px.
 * - public_id determinístico por chatbot → re-subir reemplaza el anterior.
 * - Transformación: recorte cuadrado 500x500, formato auto, calidad auto.
 */
class LogoService {
  uploadLogo = async (chatbotId, file) => {
    if (!isCloudinaryConfigured()) {
      throw new Error('Cloudinary no está configurado (faltan credenciales en el .env)');
    }
    if (!file) throw new Error('No se recibió ningún archivo');
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new Error('Formato no permitido. Usa PNG, JPG, WEBP o SVG.');
    }

    // express-fileupload con useTempFiles guarda en file.tempFilePath
    const source = file.tempFilePath || `data:${file.mimetype};base64,${file.data?.toString('base64')}`;

    const result = await cloudinary.uploader.upload(source, {
      folder: FOLDER,
      public_id: `bot_${chatbotId}`,
      overwrite: true,
      invalidate: true,             // refresca la CDN al reemplazar
      resource_type: 'image',
      transformation: [
        { width: 500, height: 500, crop: 'fill', gravity: 'auto' },
        { quality: 'auto', fetch_format: 'auto' },
      ],
    });

    logger.info('✅ Logo subido a Cloudinary', { chatbotId, url: result.secure_url });
    return { url: result.secure_url, publicId: result.public_id };
  };

  /** Elimina el logo de un chatbot (opcional, para limpieza). */
  deleteLogo = async (chatbotId) => {
    if (!isCloudinaryConfigured()) return { success: false };
    await cloudinary.uploader.destroy(`${FOLDER}/bot_${chatbotId}`, { invalidate: true });
    return { success: true };
  };
}

export default new LogoService();
