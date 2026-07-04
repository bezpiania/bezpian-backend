import express from 'express';
import BillingController from '../../controllers/billing/billing.controller.js';

const router = express.Router();
const billingController = new BillingController();

router.post('/checkout', billingController.checkout);
router.get('/usage', billingController.getUsage);
router.get('/plans', billingController.listPlans);
router.get('/invoices', billingController.getInvoices);
router.post('/change-plan', billingController.changePlan);
router.get('/subscription', billingController.getSubscription);
router.post('/subscribe', billingController.subscribe);
router.post('/cancel', billingController.cancel);

export default router;
