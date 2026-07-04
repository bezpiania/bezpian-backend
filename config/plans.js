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
        // Empresa = plan multi-bot (rol "manager" / agencia). Precio por bot.
        conversationsPerBot: 200,
        conversations: 1000,    // pool de referencia (200 × 5) para los límites actuales
        chatbots:      5,
        minChatbots:   2,
        members:       -1,
        pricePerBot:   30000,
        price:         -1,      // -1 = se calcula por bot (30.000 × nº de bots)
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
