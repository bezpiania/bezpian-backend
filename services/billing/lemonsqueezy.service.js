import crypto from 'crypto';
import { LS, isLemonConfigured, variantForPlan } from '../../libs/lemonsqueezy.js';
import { Workspace } from '../../models/index.js';
import logger from '../../utils/logger.js';

/**
 * Crea una sesión de checkout de Lemon Squeezy para un plan y devuelve la URL.
 * El workspace_id viaja en custom data para reconciliar en el webhook.
 */
export const createCheckout = async (plan, workspace, user) => {
    if (!isLemonConfigured()) throw new Error('Lemon Squeezy no está configurado');
    const variantId = variantForPlan(plan);
    if (!variantId) throw new Error(`No hay variante de Lemon Squeezy para el plan "${plan}"`);

    const body = {
        data: {
            type: 'checkouts',
            attributes: {
                checkout_data: {
                    email: user?.email || undefined,
                    custom: { workspace_id: workspace._id.toString(), plan },
                },
            },
            relationships: {
                store:   { data: { type: 'stores',   id: String(LS.storeId) } },
                variant: { data: { type: 'variants', id: String(variantId) } },
            },
        },
    };

    const res = await fetch(`${LS.apiBase}/checkouts`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${LS.apiKey}`,
            'Content-Type': 'application/vnd.api+json',
            Accept: 'application/vnd.api+json',
        },
        body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
        logger.error('Lemon Squeezy checkout error', { status: res.status, json });
        throw new Error('No se pudo crear el checkout');
    }
    return json?.data?.attributes?.url;
};

/** Verifica la firma HMAC del webhook (X-Signature). rawBody = Buffer/string crudo. */
export const verifyWebhook = (rawBody, signature) => {
    if (!LS.webhookSecret) return false;
    const digest = crypto.createHmac('sha256', LS.webhookSecret).update(rawBody).digest('hex');
    try {
        return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature || ''));
    } catch { return false; }
};

/**
 * Aplica un evento de webhook al workspace.
 * Eventos relevantes: subscription_created / subscription_updated / subscription_payment_success
 * → activa; subscription_expired / subscription_cancelled → past_due.
 */
export const applyWebhook = async (event) => {
    const name    = event?.meta?.event_name;
    const custom  = event?.meta?.custom_data || {};
    const attrs   = event?.data?.attributes || {};
    const workspaceId = custom.workspace_id;
    if (!workspaceId) { logger.warn('LS webhook sin workspace_id'); return; }

    const activeEvents  = ['subscription_created', 'subscription_updated', 'subscription_payment_success', 'subscription_resumed'];
    const pastDueEvents = ['subscription_expired', 'subscription_cancelled', 'subscription_paused', 'subscription_payment_failed'];

    const update = {
        'lemonSqueezy.customerId':     attrs.customer_id ? String(attrs.customer_id) : undefined,
        'lemonSqueezy.subscriptionId': event?.data?.id ? String(event.data.id) : undefined,
        'lemonSqueezy.renewsAt':       attrs.renews_at ? new Date(attrs.renews_at) : undefined,
    };
    if (activeEvents.includes(name)) update.subscriptionStatus = 'active';
    else if (pastDueEvents.includes(name)) update.subscriptionStatus = 'past_due';

    Object.keys(update).forEach(k => update[k] === undefined && delete update[k]);
    await Workspace.updateOne({ _id: workspaceId }, { $set: update });
    logger.info('LS webhook aplicado', { workspaceId, name, status: update.subscriptionStatus });
};
