import { v2 as cloudinary } from 'cloudinary';

/**
 * Configuración centralizada de Cloudinary.
 * Credenciales desde variables de entorno (nunca hardcodeadas):
 *   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 *
 * Una sola cuenta para todo el sistema (infraestructura), a diferencia de las
 * OpenAI keys que son por-chatbot.
 */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export const isCloudinaryConfigured = () =>
  Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

export default cloudinary;
