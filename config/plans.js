/**
 * plans.js — Fuente de verdad única para los límites de cada plan.
 *
 * Si se cambia un límite, se cambia AQUÍ y aplica en todo el sistema:
 * - embed.service (conversaciones — texto Y voz comparten cupo)
 * - planLimits.middleware (chatbots, miembros)
 * - billing.service (uso mensual)
 * - billing.controller (pantalla Plan)
 *
 * -1 = ilimitado
 */
export const PLAN_CONFIG = {
    free: {
        label:         'Free',
        conversations: 10,
        chatbots:      1,
        members:       2,
        price:         0,
    },
    basico: {
        label:         'Básico',
        conversations: 200,
        chatbots:      1,
        members:       3,
        price:         50000,
    },
    pro: {
        label:         'Pro',
        conversations: 1000,
        chatbots:      3,
        members:       10,
        price:         150000,
    },
    enterprise: {
        label:         'Empresa',
        conversations: -1,
        chatbots:      -1,
        members:       -1,
        price:         -1,   // -1 = precio a medida
    },
};

// Alias de claves antiguas → nuevas (evita romper workspaces existentes)
const PLAN_ALIASES = { starter: 'basico' };

/** Normaliza una clave de plan (resuelve alias legacy). */
export const normalizePlan = (plan) => PLAN_ALIASES[plan] || plan;

/** Claves de plan válidas (para validación de enum). */
export const PLAN_KEYS = Object.keys(PLAN_CONFIG);

/** Returns limits for a given plan key, defaulting to 'free'. */
export const getPlanLimits = (plan) => PLAN_CONFIG[normalizePlan(plan)] || PLAN_CONFIG.free;
