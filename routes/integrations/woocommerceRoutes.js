import express from 'express';
import { woocommerceController } from '../../controllers/integrations/woocommerce.controller.js';
const router = express.Router({ mergeParams: true }); // mergeParams → gets :id from parent

router.get   ('/',       woocommerceController.getConfig);
router.put   ('/',       woocommerceController.saveConfig);
router.post  ('/test',   woocommerceController.testConnection);
router.post  ('/sync',   woocommerceController.sync);

export default router;
