/**
 * subscription.js — estado efectivo de la suscripción de un workspace.
 *
 * Modelo: al registrarse el usuario elige plan y entra en 'trialing' con 7 días
 * de gracia (graceEndsAt). Si paga (Lemon Squeezy) pasa a 'active'. Si vence la
 * gracia sin pagar → se considera 'past_due' (bloqueo suave: el bot se pausa).
 */

/** ¿El workspace puede operar (bot responde, panel completo)? */
export const isSubscriptionActive = (workspace) => {
    if (!workspace) return false;
    const status = workspace.subscriptionStatus || 'trialing';
    if (status === 'active') return true;
    if (status === 'trialing') {
        if (!workspace.graceEndsAt) return true;           // sin fecha = no expira aún
        return new Date() <= new Date(workspace.graceEndsAt);
    }
    return false; // past_due | canceled
};

/** Info para el frontend (banner de trial / pago). */
export const getSubscriptionInfo = (workspace) => {
    const status = workspace?.subscriptionStatus || 'trialing';
    let daysLeft = null;
    if (status === 'trialing' && workspace?.graceEndsAt) {
        const ms = new Date(workspace.graceEndsAt).getTime() - Date.now();
        daysLeft = Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
    }
    return {
        status,
        graceEndsAt: workspace?.graceEndsAt || null,
        daysLeft,
        active: isSubscriptionActive(workspace),
    };
};
