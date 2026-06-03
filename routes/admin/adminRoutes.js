import { Router } from 'express';
import AdminController from '../../controllers/admin/admin.controller.js';

const router = Router();
const adminController = new AdminController();

router.post('/generate-embeddings/:chatbotId', adminController.generateEmbeddings);

export default router;
