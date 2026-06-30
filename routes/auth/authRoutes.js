import express from 'express';
import AuthController from '../../controllers/auth/auth.controller.js';
import ShopifyOAuthController from '../../controllers/auth/shopify-oauth.controller.js';
import { googleRedirect, googleCallback } from '../../controllers/auth/google-oauth.controller.js';
import rateLimiter from '../../middlewares/rateLimit.middleware.js';

const router = express.Router();
const authController = new AuthController();

// Google OAuth
router.get('/google',          googleRedirect);
router.get('/google/callback', googleCallback);

// Public endpoints (con rate-limit para frenar fuerza bruta)
router.post('/signup', rateLimiter.middleware, authController.signup);
router.post('/login', rateLimiter.middleware, authController.login);
router.post('/refresh', rateLimiter.middleware, authController.refresh);
router.post('/verify-email', rateLimiter.middleware, authController.verifyEmail);
router.post('/resend-verification', rateLimiter.middleware, authController.resendVerification);
router.post('/forgot-password', rateLimiter.middleware, authController.forgotPassword);
router.post('/reset-password', rateLimiter.middleware, authController.resetPassword);

// OAuth callbacks
router.get('/shopify/callback', ShopifyOAuthController.handleCallback);

// Private endpoints (requieren auth)
router.post('/logout', authController.logout); // TODO: agregar middleware de auth
router.get('/me', authController.getMe);
router.patch('/me', authController.updateMe);
router.post('/change-password', authController.changePassword);
router.delete('/me', authController.deleteMe);

export default router;
