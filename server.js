import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import fileUpload from 'express-fileupload';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import connectMongoDB from './libs/mongoose.js';
import { authMiddleware } from './middlewares/auth.middleware.js';
import { notFound, errorHandler } from './middlewares/errorHandler.middleware.js';
import rateLimiter from './middlewares/rateLimit.middleware.js';
import emailService from './services/notifications/email.service.js';
import logger from './utils/logger.js';
import { processSyncQueue, schedulePeriodicSync } from './services/queue/sync-processor.js';

// Routes
import AuthRoutes from './routes/auth/authRoutes.js';
import WorkspaceRoutes from './routes/workspaces/workspaceRoutes.js';
import ChatbotRoutes from './routes/chatbots/chatbotRoutes.js';
import ConversationRoutes from './routes/conversations/conversationRoutes.js';
import DocumentRoutes from './routes/documents/documentRoutes.js';
import LeadRoutes from './routes/leads/leadRoutes.js';
import AppointmentRoutes from './routes/appointments/appointmentRoutes.js';
import ResourceRoutes from './routes/resources/resourceRoutes.js';
import InvitationRoutes from './routes/invitations/invitationRoutes.js';
import OrderRoutes from './routes/orders/orderRoutes.js';
import AdminRoutes from './routes/admin/adminRoutes.js';
import QuoteRoutes from './routes/quotes/quoteRoutes.js';
import BillingRoutes from './routes/billing/billingRoutes.js';
import EmbedRoutes from './routes/embed/embedRoutes.js';
import ØpiaRoutes from './routes/øpia/øpiaRoutes.js';
import WebhookRoutes from './routes/webhooks/webhookRoutes.js';
import SocialRoutes from './routes/messaging/socialRoutes.js';
import CalendarRoutes from './routes/calendar/calendarRoutes.js';
import UploadRoutes from './routes/uploads/uploadRoutes.js';
import BillingController from './controllers/billing/billing.controller.js';

const billingController = new BillingController();

connectMongoDB();

// Initialize integration sync queue
processSyncQueue();
console.log('✅ Integration sync queue initialized');

// Schedule periodic sync check every 5 minutes
setInterval(schedulePeriodicSync, 5 * 60 * 1000);
console.log('✅ Periodic sync scheduler started (every 5 minutes)');

const app = express();

// Cabeceras de seguridad. CSP/frameguard desactivados a propósito: los widgets
// embebidos (burbuja, chat, voz) se cargan en iframes cross-origin en sitios de
// clientes, y crossOriginResourcePolicy debe permitir cross-origin para que el
// embed estático (/chat) cargue desde cualquier dominio. El resto de cabeceras
// útiles (nosniff, HSTS, etc.) quedan activas sin romper nada.
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    frameguard: false,
}));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(o => o.trim());

// Public embed endpoints — allow any origin (including file:// = null origin)
const publicCors = cors({ origin: '*', credentials: false });
app.use('/api/embed', publicCors);
app.use('/api/øpia', publicCors); // marketplace Øpia (app móvil, cualquier origen)

// Admin/private endpoints — restricted origins
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (server-to-server, curl)
        // AND allow 'null' origin (file:// HTML files opened locally)
        if (!origin || origin === 'null') return callback(null, true);
        if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('CORS bloqueado'), false);
    },
    credentials: true,
}));

app.use(fileUpload({
    useTempFiles: true,
    tempFileDir: './tmp',
    createParentPath: true,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB por archivo
    abortOnLimit: true,
    responseOnLimit: 'El archivo supera el límite de 25 MB.',
}));

// Webhook de Lemon Squeezy: requiere el body CRUDO para verificar la firma HMAC,
// por eso va ANTES de express.json y con express.raw.
app.post('/api/webhooks/lemonsqueezy', express.raw({ type: '*/*' }), (req, res) => billingController.lemonWebhook(req, res));

app.use(express.json());

// Neutraliza operadores de inyección NoSQL ($, .) en body/query/params.
app.use(mongoSanitize());

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/chat', express.static(path.join(__dirname, 'public')));

// Public routes (sin autenticación)
app.use('/api/auth', AuthRoutes);
app.use('/api/embed', EmbedRoutes);
app.use('/api/øpia', ØpiaRoutes); // módulo Øpia (marketplace) — quitar esta línea para removerlo
app.use('/api/webhooks', WebhookRoutes);
app.use('/api/messaging', SocialRoutes);
app.use('/api/calendar', CalendarRoutes);
app.use('/api/quotes', QuoteRoutes);

// Protected routes (con autenticación)
app.use('/api/workspaces', authMiddleware, WorkspaceRoutes);

// Nested routes under workspaces
// These are mounted in workspaceRoutes.js to keep the structure modular
// e.g., /api/workspaces/:workspaceId/chatbots

// Resource routes nested under chatbots
app.use('/api/workspaces/:workspaceId/chatbots/:chatbotId/resources', authMiddleware, ResourceRoutes);

// Workspace-level appointments (all chatbots)
app.use('/api/workspaces/:wsId/appointments', authMiddleware, AppointmentRoutes);

// Invitations (public token lookup + protected accept)
app.use('/api/invitations', InvitationRoutes);

// Orders
app.use('/api/workspaces/:workspaceId/orders', authMiddleware, OrderRoutes);

// Admin routes (embeddings, metrics, etc.)
app.use('/api/admin', authMiddleware, AdminRoutes);

// Legacy direct routes (para compatibilidad)
app.use('/api/conversations', authMiddleware, ConversationRoutes);
app.use('/api/documents', authMiddleware, DocumentRoutes);
app.use('/api/uploads', UploadRoutes); // subida de logos (Cloudinary); auth dentro de cada ruta
app.use('/api/billing', authMiddleware, BillingRoutes);

// ── Observabilidad ──
// Health check para monitoreo externo (UptimeRobot, etc.) → alerta si el server cae
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() });
});

// Soporte: el cliente reporta un problema → llega al equipo (email + log)
app.post('/api/support', rateLimiter.middleware, async (req, res) => {
    try {
        const { email, message, context } = req.body || {};
        if (!message) return res.status(400).json({ success: false, message: 'El mensaje es requerido' });
        logger.warn('Ticket de soporte recibido', { email, context, message: String(message).slice(0, 500) });
        emailService.notifyAdmin(
            `🆘 Soporte: ${email || 'sin email'}`,
            `<h3>Nuevo ticket de soporte</h3>
             <p><strong>De:</strong> ${email || 'no indicado'}</p>
             <p><strong>Contexto:</strong> ${context || '-'}</p>
             <p><strong>Mensaje:</strong></p><p>${String(message).slice(0, 2000)}</p>`
        ).catch(() => {});
        return res.status(200).json({ success: true, message: 'Recibimos tu mensaje, te contactaremos pronto.' });
    } catch (e) {
        return res.status(500).json({ success: false, message: 'No se pudo enviar el mensaje' });
    }
});

// 404 + manejador global de errores (SIEMPRE al final, después de las rutas)
app.use(notFound);
app.use(errorHandler);

// Errores no capturados a nivel proceso → log + alerta (no tumbar el server por un rejection)
process.on('unhandledRejection', (reason) => {
    logger.error('unhandledRejection', { reason: reason?.message || String(reason), stack: reason?.stack });
    emailService.notifyAdmin('🚨 unhandledRejection', `<pre>${reason?.stack || reason}</pre>`).catch(() => {});
});
process.on('uncaughtException', (err) => {
    logger.error('uncaughtException', { message: err?.message, stack: err?.stack });
    emailService.notifyAdmin('🚨 uncaughtException', `<pre>${err?.stack || err?.message}</pre>`).catch(() => {});
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor corriendo en http://0.0.0.0:${PORT}`);
});
