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
    // 'free' se mantiene SOLO como fallback interno (default de código). No se ofrece.
    free: {
        label:         'Free',
        conversations: 10,
        chatbots:      1,
        members:       2,
        price:         0,
        offered:       false,
        manager:       false,
    },
    basico: {
        label:         'Básico',
        conversations: 100,
        chatbots:      1,
        members:       3,
        price:         50000,
        offered:       true,
        manager:       false,   // acceso simple: entra directo a su único bot
    },
    pro: {
        label:         'Pro',
        conversations: 500,
        chatbots:      1,
        members:       5,
        price:         85000,
        offered:       true,
        manager:       false,
    },
    enterprise: {
        label:         'Empresa',
        // Empresa = plan multi-bot (rol "manager" / agencia). Tarifa plana, hasta 4 bots.
        conversationsPerBot: 200,
        conversations: 800,     // pool de referencia (200 × 4)
        chatbots:      4,
        members:       -1,
        price:         60000,   // tarifa plana mensual (hasta 4 bots)
        offered:       true,
        manager:       true,    // acceso manager: ve la lista y marca el panel de cada cliente
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
