import express from 'express';
import ØpiaController from '../../controllers/øpia/øpia.controller.js';
import { øpiaAuthMiddleware } from '../../middlewares/øpia/øpiaAuth.middleware.js';
import rateLimiter from '../../middlewares/rateLimit.middleware.js';

const router = express.Router();
const ctrl = new ØpiaController();

// ── Públicas ──
router.post('/auth/register', rateLimiter.middleware, ctrl.register);
router.post('/auth/login',    rateLimiter.middleware, ctrl.login);
router.get('/restaurants',    rateLimiter.middleware, ctrl.restaurants);
router.get('/discovery',      rateLimiter.middleware, ctrl.discovery);
router.get('/restaurants/:id', rateLimiter.middleware, ctrl.restaurant);
router.get('/products/:id',    rateLimiter.middleware, ctrl.product);
router.post('/chat',          rateLimiter.middleware, ctrl.chat);

// ── Protegidas (consumidor autenticado) ──
router.get('/me',             øpiaAuthMiddleware, ctrl.me);
router.post('/orders',        øpiaAuthMiddleware, ctrl.createOrder);
router.get('/orders/active',  øpiaAuthMiddleware, ctrl.activeOrder);
router.get('/orders/history', øpiaAuthMiddleware, ctrl.orderHistory);

export default router;
