/**
 * lemonsqueezy.js — configuración de Lemon Squeezy (checkout + webhooks).
 * Credenciales desde variables de entorno (nunca hardcodeadas):
 *   LEMONSQUEEZY_API_KEY        → API key (Settings → API)
 *   LEMONSQUEEZY_STORE_ID       → ID de la tienda
 *   LEMONSQUEEZY_WEBHOOK_SECRET → secreto para verificar webhooks
 *   LEMONSQUEEZY_VARIANT_BASICO → variant id del plan Básico
 *   LEMONSQUEEZY_VARIANT_PRO    → variant id del plan Pro
 * (Empresa se maneja como venta directa, no checkout self-serve.)
 */
export const LS = {
    apiKey:        process.env.LEMONSQUEEZY_API_KEY || '',
    storeId:       process.env.LEMONSQUEEZY_STORE_ID || '',
    webhookSecret: process.env.LEMONSQUEEZY_WEBHOOK_SECRET || '',
    variants: {
        basico: process.env.LEMONSQUEEZY_VARIANT_BASICO || '',
        pro:    process.env.LEMONSQUEEZY_VARIANT_PRO || '',
    },
    apiBase: 'https://api.lemonsqueezy.com/v1',
};

export const isLemonConfigured = () => Boolean(LS.apiKey && LS.storeId);

export const variantForPlan = (plan) => LS.variants[plan] || '';
