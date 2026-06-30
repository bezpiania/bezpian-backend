import express from 'express';
import LogoController from '../../controllers/uploads/logo.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';

const router = express.Router();
const logoController = new LogoController();

// Subida de logo de chatbot (protegido). Imagen cuadrada 500x500 vía Cloudinary.
router.post('/logo', authMiddleware, logoController.upload);

export default router;
