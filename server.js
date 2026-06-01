import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import fileUpload from 'express-fileupload';
import path from 'path';
import connectMongoDB from './libs/mongoose.js';
import { authMiddleware } from './middlewares/auth.middleware.js';
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
import QuoteRoutes from './routes/quotes/quoteRoutes.js';
import BillingRoutes from './routes/billing/billingRoutes.js';
import EmbedRoutes from './routes/embed/embedRoutes.js';
import WebhookRoutes from './routes/webhooks/webhookRoutes.js';
import SocialRoutes from './routes/messaging/socialRoutes.js';
import CalendarRoutes from './routes/calendar/calendarRoutes.js';

connectMongoDB();

// Initialize integration sync queue
processSyncQueue();
console.log('✅ Integration sync queue initialized');

// Schedule periodic sync check every 5 minutes
setInterval(schedulePeriodicSync, 5 * 60 * 1000);
console.log('✅ Periodic sync scheduler started (every 5 minutes)');

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(o => o.trim());

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('CORS bloqueado'), false);
    },
    credentials: true,
}));

app.use(fileUpload({
    useTempFiles: true,
    tempFileDir: './tmp',
    createParentPath: true,
}));

app.use(express.json());

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Public routes (sin autenticación)
app.use('/api/auth', AuthRoutes);
app.use('/api/embed', EmbedRoutes);
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

// Legacy direct routes (para compatibilidad)
app.use('/api/conversations', authMiddleware, ConversationRoutes);
app.use('/api/documents', authMiddleware, DocumentRoutes);
app.use('/api/billing', authMiddleware, BillingRoutes);

const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor corriendo en http://0.0.0.0:${PORT}`);
});
