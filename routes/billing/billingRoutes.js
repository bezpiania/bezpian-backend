import express from 'express';
import BillingController from '../../controllers/billing/billing.controller.js';

const router = express.Router();
const billingController = new BillingController();

router.get('/usage', billingController.getUsage);
router.get('/plans', billingController.listPlans);
router.get('/subscription', billingController.getSubscription);
router.post('/subscribe', billingController.subscribe);
router.post('/change-plan', billingController.changePlan);
router.post('/cancel', billingController.cancel);
router.get('/payments', billingController.listPayments);
router.get('/invoices/:id', billingController.getInvoice);

export default router;
