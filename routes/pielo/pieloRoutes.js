import express from 'express';
import PieloController from '../../controllers/pielo/pielo.controller.js';
import { pieloAuthMiddleware } from '../../middlewares/pielo/pieloAuth.middleware.js';
import rateLimiter from '../../middlewares/rateLimit.middleware.js';

const router = express.Router();
const ctrl = new PieloController();

// ── Públicas ──
router.post('/auth/register', rateLimiter.middleware, ctrl.register);
router.post('/auth/login',    rateLimiter.middleware, ctrl.login);
router.get('/restaurants',    rateLimiter.middleware, ctrl.restaurants);
router.get('/discovery',      rateLimiter.middleware, ctrl.discovery);
router.get('/restaurants/:id', rateLimiter.middleware, ctrl.restaurant);
router.get('/products/:id',    rateLimiter.middleware, ctrl.product);
router.post('/chat',          rateLimiter.middleware, ctrl.chat);

// ── Protegidas (consumidor autenticado) ──
router.get('/me',             pieloAuthMiddleware, ctrl.me);
router.post('/orders',        pieloAuthMiddleware, ctrl.createOrder);
router.get('/orders/active',  pieloAuthMiddleware, ctrl.activeOrder);
router.get('/orders/history', pieloAuthMiddleware, ctrl.orderHistory);

export default router;
