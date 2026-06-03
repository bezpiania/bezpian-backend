/**
 * plans.js — Fuente de verdad única para los límites de cada plan.
 *
 * Si se cambia un límite, se cambia AQUÍ y aplica en todo el sistema:
 * - embed.service (conversaciones)
 * - planLimits.middleware (chatbots, miembros)
 * - billing.service (uso mensual)
 * - billing.controller (pantalla Plan)
 *
 * -1 = ilimitado
 */
export const PLAN_CONFIG = {
    free: {
        label:         'Free',
        conversations: 500,
        chatbots:      1,
        members:       2,
        price:         0,
    },
    starter: {
        label:         'Starter',
        conversations: 1000,
        chatbots:      1,
        members:       2,
        price:         9990,
    },
    pro: {
        label:         'Pro',
        conversations: 5000,
        chatbots:      3,
        members:       10,
        price:         29990,
    },
    enterprise: {
        label:         'Empresa',
        conversations: 50000,
        chatbots:      -1,
        members:       -1,
        price:         99000,
    },
};

/** Returns limits for a given plan key, defaulting to 'free'. */
export const getPlanLimits = (plan) => PLAN_CONFIG[plan] || PLAN_CONFIG.free;
