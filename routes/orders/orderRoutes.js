import { Router } from 'express';
import OrderController from '../../controllers/orders/order.controller.js';

const router = Router({ mergeParams: true });
const ctrl = new OrderController();

router.get('/',     ctrl.list);
router.get('/:id',  ctrl.get);
router.patch('/:id/status', ctrl.updateStatus);

export default router;
