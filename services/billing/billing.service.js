import { Subscription, Payment, Workspace, WorkspaceMember } from '../../models/index.js';
import Chatbot from '../../models/Chatbot.js';
import Conversation from '../../models/Conversation.js';
import { getPlanLimits, PLAN_KEYS, normalizePlan } from '../../config/plans.js';

const PLANS = [
    {
        id: 'starter',
        name: 'Starter',
        price: 9900,
        currency: 'ARS',
        features: ['1 chatbot', '10,000 mensajes/mes', 'Soporte por email'],
        billingPeriod: 'monthly'
    },
    {
        id: 'professional',
        name: 'Professional',
        price: 29900,
        currency: 'ARS',
        features: ['5 chatbots', '100,000 mensajes/mes', 'Integraciones', 'Soporte prioritario'],
        billingPeriod: 'monthly'
    },
    {
        id: 'enterprise',
        name: 'Enterprise',
        price: 99900,
        currency: 'ARS',
        features: ['Chatbots ilimitados', 'Mensajes ilimitados', 'Todas las integraciones', 'Soporte 24/7'],
        billingPeriod: 'monthly'
    }
];

export default class BillingService {
    getUsage = async (workspaceId) => {
        try {
            const workspace = await Workspace.findById(workspaceId).select('plan name');
            if (!workspace) return { success: false, message: 'Workspace no encontrado' };

            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

            const [conversations, chatbots, members] = await Promise.all([
                Conversation.countDocuments({ workspaceId, createdAt: { $gte: monthStart, $lte: monthEnd } }),
                Chatbot.countDocuments({ workspaceId, status: 'active' }),
                WorkspaceMember.countDocuments({ workspaceId, status: { $ne: 'removed' } }),
            ]);

            const plan   = workspace.plan || 'free';
            const limits = getPlanLimits(plan);

            return {
                success: true,
                data: {
                    plan,
                    workspaceName: workspace.name,
                    usage: { conversations, chatbots, members },
                    limits,
                    periodStart: monthStart,
                    periodEnd:   monthEnd,
                },
            };
        } catch (error) {
            console.error('❌ BillingService.getUsage:', error);
            return { success: false, message: error.message };
        }
    };

    listPlans = async () => {
        try {
            return {
                success: true,
                message: 'Planes obtenidos',
                data: { plans: PLANS }
            };
        } catch (error) {
            console.error('❌ BillingService.listPlans:', error);
            return { success: false, message: error.message };
        }
    };

    getSubscription = async (workspaceId) => {
        try {
            const subscription = await Subscription.findOne({ workspaceId });

            if (!subscription) {
                return {
                    success: true,
                    message: 'No hay suscripción activa',
                    data: { subscription: null }
                };
            }

            return {
                success: true,
                message: 'Suscripción obtenida',
                data: { subscription }
            };
        } catch (error) {
            console.error('❌ BillingService.getSubscription:', error);
            return { success: false, message: error.message };
        }
    };

    subscribe = async (workspaceId, planId) => {
        try {
            const plan = PLANS.find(p => p.id === planId);
            if (!plan) {
                return { success: false, message: 'Plan no encontrado' };
            }

            // Mock Mercado Pago preference creation
            const preferenceId = `pref_${Date.now()}`;
            const checkoutUrl = `https://www.mercadopago.com.ar/checkout/v1/redirect?preference-id=${preferenceId}`;

            // Create subscription record
            const subscription = new Subscription({
                workspaceId,
                planId,
                status: 'pending_payment',
                currentPeriodStart: new Date(),
                currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                mercadoPagoPreferenceId: preferenceId
            });

            await subscription.save();

            return {
                success: true,
                message: 'Checkout generado',
                data: { checkoutUrl, preferenceId }
            };
        } catch (error) {
            console.error('❌ BillingService.subscribe:', error);
            return { success: false, message: error.message };
        }
    };

    changePlan = async (workspaceId, newPlanId) => {
        try {
            const plan = normalizePlan(newPlanId);
            if (!PLAN_KEYS.includes(plan)) {
                return { success: false, message: 'Plan no válido' };
            }

            // Update workspace.plan — source of truth for limits
            const workspace = await Workspace.findByIdAndUpdate(
                workspaceId,
                { plan },
                { new: true }
            );
            if (!workspace) return { success: false, message: 'Workspace no encontrado' };

            // Upsert subscription record for billing history
            await Subscription.findOneAndUpdate(
                { workspaceId },
                {
                    plan,
                    status: 'active',
                    currentPeriodStart: new Date(),
                    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                },
                { upsert: true, new: true }
            );

            return {
                success: true,
                message: `Plan cambiado a ${newPlanId} correctamente`,
                data: { plan: newPlanId },
            };
        } catch (error) {
            console.error('❌ BillingService.changePlan:', error);
            return { success: false, message: error.message };
        }
    };

    getInvoices = async (workspaceId) => {
        try {
            const payments = await Payment.find({ workspaceId })
                .sort({ createdAt: -1 })
                .limit(12)
                .select('amount currency status createdAt externalReference paymentMethod');

            return { success: true, data: { invoices: payments } };
        } catch (error) {
            console.error('❌ BillingService.getInvoices:', error);
            return { success: false, message: error.message };
        }
    };

    cancel = async (workspaceId) => {
        try {
            const subscription = await Subscription.findOneAndUpdate(
                { workspaceId },
                {
                    status: 'cancelled',
                    cancelledAt: new Date()
                },
                { new: true }
            );

            if (!subscription) {
                return { success: false, message: 'Suscripción no encontrada' };
            }

            return {
                success: true,
                message: 'Suscripción cancelada correctamente'
            };
        } catch (error) {
            console.error('❌ BillingService.cancel:', error);
            return { success: false, message: error.message };
        }
    };

    listPayments = async (workspaceId) => {
        try {
            const payments = await Payment.find({ workspaceId }).sort({ createdAt: -1 });

            return {
                success: true,
                message: 'Pagos obtenidos',
                data: { payments }
            };
        } catch (error) {
            console.error('❌ BillingService.listPayments:', error);
            return { success: false, message: error.message };
        }
    };

    getInvoice = async (paymentId) => {
        try {
            const payment = await Payment.findById(paymentId);

            if (!payment) {
                return { success: false, message: 'Pago no encontrado' };
            }

            const invoiceUrl = `${process.env.API_URL}/api/invoices/${paymentId}/pdf`;

            return {
                success: true,
                message: 'Factura obtenida',
                data: { invoiceUrl, payment }
            };
        } catch (error) {
            console.error('❌ BillingService.getInvoice:', error);
            return { success: false, message: error.message };
        }
    };

    recordPayment = async (workspaceId, mercadoPagoData) => {
        try {
            const payment = new Payment({
                workspaceId,
                mercadoPagoId: mercadoPagoData.id,
                amount: mercadoPagoData.transaction_amount,
                currency: mercadoPagoData.currency_id,
                status: mercadoPagoData.status,
                paymentMethod: mercadoPagoData.payment_method_id,
                externalReference: mercadoPagoData.external_reference
            });

            await payment.save();

            return {
                success: true,
                message: 'Pago registrado',
                data: { payment }
            };
        } catch (error) {
            console.error('❌ BillingService.recordPayment:', error);
            return { success: false, message: error.message };
        }
    };
}
