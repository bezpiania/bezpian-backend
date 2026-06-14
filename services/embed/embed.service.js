import crypto from 'crypto';
import * as chrono from 'chrono-node';
import { getPlanLimits } from '../../config/plans.js';
import Chatbot from '../../models/Chatbot.js';
import Conversation from '../../models/Conversation.js';
import Message from '../../models/Message.js';
import Appointment from '../../models/Appointment.js';
import Lead from '../../models/Lead.js';
import Quote from '../../models/Quote.js';
import Order from '../../models/Order.js';
import Resource from '../../models/Resource.js';
import CompanyInfo from '../../models/CompanyInfo.js';
import { Workspace } from '../../models/index.js';
import openaiService from '../openai/openai.service.js';
import AdvancedRAGService from '../rag/advanced-rag.service.js';
import chatbotConfigService from '../config/chatbot-config.service.js';
import appointmentService from '../appointments/appointment.service.js';
import { findBestResource } from '../appointments/resource-availability.service.js';
import socialService from '../messaging/social.service.js';
import whatsappService from '../messaging/whatsapp.service.js';
import emailService from '../notifications/email.service.js';
import calendarService from '../calendar/calendar.service.js';
import stockService from '../stock/stock.service.js';
import logger from '../../utils/logger.js';

const whatsAppInstance = new whatsappService();
const advancedRag = new AdvancedRAGService();

function buildAppointmentTool(chatbot) {
    const customFields = chatbot.appointmentFields?.length ? chatbot.appointmentFields : [
        { fieldId: 'name', label: 'Nombre', required: true },
        { fieldId: 'phone', label: 'Teléfono', required: true },
    ];

    const properties = {
        date:              { type: 'string',  description: 'Fecha en formato YYYY-MM-DD' },
        time:              { type: 'string',  description: 'Hora en formato HH:MM (24h)' },
        guest_count:       { type: 'integer', description: 'Número de personas' },
        preferred_resource:{ type: 'string',  description: 'Nombre del especialista/recurso preferido por el cliente (si lo mencionó)' },
    };
    const required = ['date', 'time', 'guest_count'];

    for (const f of customFields) {
        const key = f.fieldId;
        properties[key] = { type: 'string', description: `${f.label}${f.helpText ? ' — ' + f.helpText : ''}` };
        if (f.required) required.push(key);
    }

    return {
        type: 'function',
        function: {
            name: 'book_appointment',
            description: `Reserva una mesa o cita. REGLAS ESTRICTAS:
1. NUNCA llames esta función si el cliente solo está consultando disponibilidad, preguntando si hay mesas, o haciendo una pregunta (contiene "?" o palabras como "¿tienen", "¿hay", "¿puedo", "¿están disponibles").
2. SOLO llama esta función cuando el cliente haya dado EXPLÍCITAMENTE: su nombre real, teléfono real, fecha y hora deseadas.
3. NUNCA inventes ni uses valores de placeholder como "Usuario", "Cliente", "Tu nombre", "123456789", "[nombre]", etc.
4. Si falta cualquier dato obligatorio, pregúntalo primero — no llames la función.
5. Para consultas de disponibilidad, responde en texto indicando los horarios disponibles sin llamar esta función.`,
            parameters: { type: 'object', properties, required },
        },
    };
}

const GENERATE_QUOTE_TOOL = {
    type: 'function',
    function: {
        name: 'generate_quote',
        description: 'Genera una cotización formal cuando el cliente quiere una propuesta de precio, pide cotización, o su pedido supera el umbral de volumen configurado. Llama esta función cuando tengas los productos y el email del cliente.',
        parameters: {
            type: 'object',
            properties: {
                customer_name:  { type: 'string',  description: 'Nombre del cliente o empresa' },
                customer_email: { type: 'string',  description: 'Email para enviar la cotización (OBLIGATORIO)' },
                customer_phone: { type: 'string',  description: 'Teléfono (opcional)' },
                notes:          { type: 'string',  description: 'Notas o condiciones especiales (opcional)' },
                items: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name:       { type: 'string',  description: 'Nombre del producto' },
                            quantity:   { type: 'integer', description: 'Cantidad' },
                            unit_price: { type: 'number',  description: 'Precio unitario' },
                            variant:    { type: 'string',  description: 'Variante (opcional)' },
                        },
                        required: ['name', 'quantity', 'unit_price'],
                    },
                },
            },
            required: ['customer_name', 'customer_email', 'items'],
        },
    },
};

const REQUEST_BILL_TOOL = {
    type: 'function',
    function: {
        name: 'request_bill',
        description: 'Solicita la cuenta para la mesa del cliente. Llama esta función cuando el cliente pida la cuenta, el cheque, o quiera pagar.',
        parameters: {
            type: 'object',
            properties: {
                notes: { type: 'string', description: 'Notas adicionales (ej: pagar con tarjeta, dividir la cuenta)' },
            },
            required: [],
        },
    },
};

function buildOrderTool(chatbot) {
    const isStore = chatbot.businessType === 'store';
    const isDineInContext = false; // Will be evaluated at runtime

    // Item schema — store adds variant field
    const itemProperties = {
        name:       { type: 'string',  description: 'Nombre exacto del producto' },
        quantity:   { type: 'integer', description: 'Cantidad pedida' },
        unit_price: { type: 'number',  description: 'Precio unitario del producto' },
        notes:      { type: 'string',  description: 'Observaciones para este ítem (opcional)' },
        ...(isStore && {
            variant:    { type: 'string', description: 'Variante elegida (talla, color, modelo, etc.) — OBLIGATORIO si el producto tiene variantes' },
            product_id: { type: 'string', description: 'ID del producto si está disponible (opcional)' },
        }),
    };

    const description = isStore
        ? 'Crea un pedido cuando el cliente ha confirmado TODOS los productos con sus variantes (talla/color/modelo), nombre y teléfono. Para productos con variantes, SIEMPRE confirma la variante antes de llamar esta función.'
        : 'Crea un pedido cuando el cliente ha confirmado todos los productos, dirección y datos de contacto.';

    return {
        type: 'function',
        function: {
            name: 'create_order',
            description,
            parameters: {
                type: 'object',
                properties: {
                    customer_name:    { type: 'string', description: 'Nombre completo del cliente' },
                    customer_phone:   { type: 'string', description: 'Teléfono del cliente' },
                    customer_email:   { type: 'string', description: 'Email del cliente (opcional)' },
                    delivery_address: { type: 'string', description: 'Dirección de entrega o "retiro en tienda"' },
                    delivery_zone:    { type: 'string', description: 'Zona o barrio (opcional)' },
                    notes:            { type: 'string', description: 'Notas generales del pedido (opcional)' },
                    items: {
                        type: 'array',
                        description: 'Lista de productos pedidos',
                        items: { type: 'object', properties: itemProperties, required: ['name', 'quantity', 'unit_price'] },
                    },
                },
                required: ['customer_name', 'customer_phone', 'delivery_address', 'items'],
            },
        },
    };
}

/**
 * Ensambla el array de tools (Chat Completions format) según features/businessType del bot.
 * Misma lógica que sendMessage usa inline — extraída para reutilizarla en el widget de voz.
 */
async function buildToolsForChatbot(chatbot, conversation) {
    const features = chatbot.features || {};
    const calEnabled = features.appointments && chatbot.integrations?.calendar?.enabled;
    const activeResources = calEnabled ? await Resource.find({ chatbotId: chatbot._id, isActive: true }) : [];
    const appointmentTools = activeResources.length > 0 ? [buildAppointmentTool(chatbot)] : [];
    const isDineIn = !!(conversation?.visitorMetadata?.tableId);
    const deliveryEnabled = !!(features.sales || chatbot.deliveryConfig?.enabled);
    const deliveryTools = deliveryEnabled && (chatbot.deliveryConfig?.enabled || isDineIn) ? [buildOrderTool(chatbot)] : [];
    const billTools     = deliveryEnabled && isDineIn ? [REQUEST_BILL_TOOL] : [];
    const quoteTools    = features.quotes && (chatbot.businessType === 'store' && chatbot.quoteConfig?.enabled) ? [GENERATE_QUOTE_TOOL] : [];
    return [...appointmentTools, ...deliveryTools, ...billTools, ...quoteTools];
}

/**
 * Convierte tools de formato Chat Completions ({type, function:{name,...}})
 * al formato aplanado que usa la Realtime API GA ({type:'function', name, ...}).
 */
function toRealtimeTools(tools) {
    return (tools || []).map(t => ({
        type: 'function',
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
    }));
}

// Limpieza de cache cada 30 minutos
setInterval(() => {
    advancedRag.cleanupCache();
}, 30 * 60 * 1000);

export default class EmbedService {
    constructor() {
    }

    startConversation = async (embedKey, visitorId, visitorMetadata = {}, tableId = null) => {
        try {
            const chatbot = await Chatbot.findOne({ embedKey });
            if (!chatbot) {
                return { success: false, message: 'Chatbot no encontrado' };
            }

            // Check conversation limit for workspace plan
            const workspace = await Workspace.findById(chatbot.workspaceId).select('plan');
            const { conversations: limit } = getPlanLimits(workspace?.plan);
            if (limit > 0 && limit !== -1) {
                const now = new Date();
                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                const count = await Conversation.countDocuments({
                    workspaceId: chatbot.workspaceId,
                    createdAt: { $gte: monthStart },
                });
                if (count >= limit) {
                    return {
                        success: false,
                        limitReached: true,
                        message: `Este negocio ha alcanzado su límite de conversaciones este mes. Por favor intenta más tarde.`,
                    };
                }
            }

            // Resolve table info if tableId provided
            let tableName = null;
            let resolvedTableId = tableId;
            if (tableId) {
                        const table = await Resource.findById(tableId).select('name');
                tableName = table?.name || null;
            }

            const conversation = new Conversation({
                chatbotId: chatbot._id,
                workspaceId: chatbot.workspaceId,
                visitorId: visitorId || 'anonymous',
                visitorMetadata: { ...visitorMetadata, tableId: resolvedTableId, tableName },
                status: 'active'
            });

            await conversation.save();

            const hasResources = await Resource.exists({ chatbotId: chatbot._id, isActive: true });
            const isDineIn = !!tableId;
            const botDisplayName = chatbot.name || chatbot.personality?.welcomeMessage?.split(' ')[0] || 'nosotros';
            const dineInWelcome = isDineIn && tableName
                ? `¡Bienvenido a ${botDisplayName}! 👋 Estás en **${tableName}**. Puedo tomar tu pedido, mostrarte el menú o pedir la cuenta cuando estés listo. ¿Qué deseas?`
                : null;

            return {
                success: true,
                message: 'Conversación iniciada',
                data: {
                    conversationId: conversation._id,
                    botId: chatbot._id,
                    welcomeMessage: dineInWelcome || chatbot.personality?.welcomeMessage || '¡Hola! ¿En qué te puedo ayudar?',
                    tableId: resolvedTableId,
                    tableName,
                    isDineIn,
                    features: {
                        appointmentsEnabled: !!(chatbot.integrations?.calendar?.enabled && hasResources && !isDineIn),
                        quotesEnabled: !!(chatbot.quoteFields?.length > 0),
                        dineInEnabled: isDineIn,
                    }
                }
            };
        } catch (error) {
            console.error('❌ EmbedService.startConversation:', error);
            return { success: false, message: error.message };
        }
    };

    sendMessage = async (conversationId, content, botId, visitorContext = {}) => {
        const startTime = Date.now();
        try {
            // 1. Validaciones iniciales
            const chatbot = await Chatbot.findById(botId);
            const conversation = await Conversation.findById(conversationId);

            if (!chatbot) {
                logger.warn('Chatbot not found', { botId, conversationId });
                return { success: false, message: 'Chatbot no encontrado' };
            }

            if (!conversation) {
                logger.warn('Conversation not found', { conversationId });
                return { success: false, message: 'Conversación no encontrada' };
            }

            if (!chatbot.openaiApiKey) {
                logger.warn('OpenAI API key not configured', { botId });
                return {
                    success: false,
                    message: 'OpenAI API key no configurada. Por favor, configura tu chatbot.'
                };
            }

            // 2. Verificar cache de respuesta
            // SKIP cache for chatbots with appointments or orders active — responses are conversation-specific
            const hasAppointmentFlow = !!(chatbot.features?.appointments && chatbot.appointmentFields?.length > 0);
            const hasOrderFlow = !!(chatbot.features?.orders || chatbot.features?.sales || chatbot.deliveryConfig?.enabled);
            const skipCache = hasAppointmentFlow || hasOrderFlow;
            const cachedResponse = skipCache ? null : advancedRag.getCachedResponse(botId, content);
            if (cachedResponse) {
                logger.info('Returning cached response', {
                    botId,
                    contentLength: content.length
                });

                // Aún guardar mensaje del usuario
                await Message.create({
                    conversationId: conversation._id,
                    chatbotId: chatbot._id,
                    role: 'user',
                    content: content,
                    createdAt: new Date()
                });

                return {
                    success: true,
                    message: 'Mensaje procesado (desde cache)',
                    data: {
                        botMessage: {
                            content: cachedResponse,
                            role: 'assistant',
                            cached: true
                        }
                    }
                };
            }

            // 3. Guardar mensaje del usuario
            await Message.create({
                conversationId: conversation._id,
                chatbotId: chatbot._id,
                role: 'user',
                content: content,
                createdAt: new Date()
            });

            // 3.5. Captura automática de leads — desactivada temporalmente
            // TODO: reactivar cuando el módulo de leads esté listo
            // const LeadServiceClass = (await import('./../../services/leads/lead.service.js')).default;
            // const leadService = new LeadServiceClass();
            // const leadProcessResult = await leadService.processMessageForLead(
            //     conversationId,
            //     content,
            //     chatbot._id,
            //     chatbot.workspaceId
            // );
            // if (leadProcessResult.leadDetected) {
            //     logger.info('✅ Lead detectado y guardado automáticamente', {
            //         conversationId,
            //         leadId: leadProcessResult.leadId,
            //         leadInfo: leadProcessResult.leadInfo
            //     });
            // }

            // 4. Obtener información adicional de empresa
            const companyInfo = await CompanyInfo.findOne({ workspaceId: chatbot.workspaceId });

            // 5. Búsqueda semántica de documentos
            const ragStartTime = Date.now();
            const ragChunks = await advancedRag.searchDocumentsBySemantics(
                chatbot._id,
                content,
                5,
                chatbot.openaiApiKey
            );
            const ragDuration = Date.now() - ragStartTime;
            logger.performance('RAG Search', ragDuration, { chunks: ragChunks.length });

            // 6. Búsqueda de productos (primero intentar búsqueda de regalos)
            let products = [];
            const giftSearchResult = await advancedRag.searchGiftProducts(chatbot._id, content, 5);

            if (giftSearchResult.isGift && giftSearchResult.products.length > 0) {
                // Es una pregunta de regalo y hay productos disponibles
                products = giftSearchResult.products;
                console.log('🎁 [GIFT-SEARCH] Using gift products:', products.map(p => p.name));
            } else {
                // Búsqueda normal de productos
                products = await advancedRag.searchProducts(chatbot._id, content, 5, chatbot.openaiApiKey);
            }

            console.log('🔍 [DEBUG] Búsqueda de productos:', {
                query: content,
                productsFound: products.length,
                products: products.map(p => ({ name: p.name, stock: p.stock, similarity: p.similarity }))
            });

            // 6.5. Detectar solicitud de cotización (pero NO generar automáticamente)
            const QuoteGeneratorService = (await import('./../../services/quotes/quote-generator.service.js')).default;
            let quoteData = null;
            let shouldAskForQuote = false;

            if (QuoteGeneratorService.isQuoteRequest(content)) {
                // Usuario pidió cotización - pero NO generamos automáticamente
                // Solo marcamos que deberíamos preguntar
                shouldAskForQuote = true;
                logger.info('User requested a quote but we will ask for confirmation', {
                    conversationId,
                    productsFound: products.length
                });
            }

            // 7. Construir contexto optimizado (incluye additionalInfo)
            let contextText = advancedRag.buildContext(
                ragChunks,
                products,
                chatbot.personality?.customPrompt
            );

            console.log('📄 [DEBUG] Contexto construido:', {
                contextLength: contextText.length,
                hasProducts: contextText.includes('CATÁLOGO DE PRODUCTOS'),
                firstProducts: contextText.substring(0, 500)
            });

            // Agregar información adicional si existe
            if (companyInfo?.additionalInfo && companyInfo.additionalInfo.length > 0) {
                contextText += '\n\n📋 INFORMACIÓN ADICIONAL DEL ADMINISTRADOR:\n';
                for (const qa of companyInfo.additionalInfo) {
                    if (qa.question && qa.answer) {
                        contextText += `- P: ${qa.question}\n  R: ${qa.answer}\n`;
                    }
                }
            }

            // 8. Validar token count
            const isValidTokenCount = advancedRag.validateTokenCount(contextText);
            if (!isValidTokenCount) {
                logger.warn('Context exceeds token limit', { botId, contextLength: contextText.length });
            }

            // 9. Obtener historial (últimos 6 mensajes para no exceder contexto)
            const history = await Message.find({
                conversationId: conversation._id
            }).limit(6).sort({ createdAt: -1 }).lean();

            // 10. Construir system prompt rico (con datos de empresa integrados)
            let systemPrompt = await chatbotConfigService.buildSystemPrompt(
                chatbot.workspaceId,
                chatbot._id
            );

            // Agregar contexto del visitante (isLoggedIn, role, etc.)
            if (visitorContext && Object.keys(visitorContext).length > 0) {
                const lines = [];
                if (visitorContext.isLoggedIn !== undefined)
                    lines.push(`- Autenticado: ${visitorContext.isLoggedIn ? 'Sí' : 'No'}`);
                if (visitorContext.name)   lines.push(`- Nombre: ${visitorContext.name}`);
                if (visitorContext.email)  lines.push(`- Email: ${visitorContext.email}`);
                if (visitorContext.role)   lines.push(`- Rol/Plan: ${visitorContext.role}`);
                if (visitorContext.custom && typeof visitorContext.custom === 'object') {
                    Object.entries(visitorContext.custom).forEach(([k, v]) => lines.push(`- ${k}: ${v}`));
                }
                if (lines.length > 0) {
                    systemPrompt += `\n\n👤 CONTEXTO DEL USUARIO:\n${lines.join('\n')}`;
                }
            }

            // Agregar contexto RAG al final del system prompt
            if (contextText) {
                systemPrompt += `\n\nINFORMACIÓN ADICIONAL DE DOCUMENTOS:\n${contextText}`;
            }

            const messages = [
                {
                    role: 'system',
                    content: systemPrompt
                },
                ...history.reverse().map(msg => ({
                    role: msg.role,
                    content: msg.content
                })),
                {
                    role: 'user',
                    content: content
                }
            ];

            // 10c. Pre-LLM booking check — if all required booking data is already collected,
            // show the confirmation summary or complete the booking without calling the LLM
            {
                const slotsNow = conversation.pendingBookingSlots || {};
                const cfNow = slotsNow.collectedFields || {};
                const hasDateNow = slotsNow.date && /^\d{4}-\d{2}-\d{2}$/.test(slotsNow.date);
                const hasTimeNow = slotsNow.time && /^\d{2}:\d{2}$/.test(slotsNow.time);
                if (hasDateNow && hasTimeNow && chatbot.appointmentFields?.length > 0) {
                    // Extract any new field values from current message
                    const apptFieldsNow = chatbot.appointmentFields || [];
                    const allUserMsgsNow = (await Message.find({ conversationId: conversation._id, role: 'user' }).sort({ createdAt: -1 }).limit(20)).map(m => m.content || '');
                    if (content && !allUserMsgsNow.includes(content)) allUserMsgsNow.push(content);

                    // Phone extraction
                    if (!cfNow['phone']) {
                        const phoneM = allUserMsgsNow.join(' ').match(/(?:^|\s)(\+?[0-9]{7,15})(?:\s|$)/);
                        if (phoneM) cfNow['phone'] = phoneM[1].trim();
                    }
                    // Name extraction
                    if (!cfNow['name']) {
                        for (const msg of allUserMsgsNow) {
                            const nameM = msg.trim().match(/(?:mi nombre es|me llamo|soy)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)\s*[.,!?]?\s*$/i);
                            if (nameM) { cfNow['name'] = nameM[1].trim(); break; }
                        }
                    }
                    // Date/time change detection — if the CURRENT message contains a new date/time, update saved slots
                    // e.g. "Mejor el domingo a las 6pm" should override the previously saved date
                    if (content) {
                        try {
                            const dateChangePatterns = /mejor|cambiar|cambio|prefiero|en cambio|para el|para la|el (lunes|martes|miércoles|jueves|viernes|sábado|domingo)|próximo|siguiente|ahora el/i;
                            if (dateChangePatterns.test(content)) {
                                const parsed = chrono.es.parse(content, new Date(), { forwardDate: true });
                                if (parsed.length > 0) {
                                    const dt = parsed[0].start.date();
                                    const today = new Date(); today.setHours(0,0,0,0);
                                    if (dt >= today) {
                                        const yyyy = dt.getFullYear();
                                        const mm = String(dt.getMonth()+1).padStart(2,'0');
                                        const dd = String(dt.getDate()).padStart(2,'0');
                                        const hh = String(dt.getHours()).padStart(2,'0');
                                        const mi = String(dt.getMinutes()).padStart(2,'0');
                                        const newDate = `${yyyy}-${mm}-${dd}`;
                                        const newTime = `${hh}:${mi}`;
                                        if (newDate !== slotsNow.date || newTime !== slotsNow.time) {
                                            slotsNow.date = newDate;
                                            slotsNow.time = newTime;
                                            await Conversation.updateOne({ _id: conversation._id }, {
                                                $set: { 'pendingBookingSlots.date': newDate, 'pendingBookingSlots.time': newTime, 'pendingBookingSlots.savedAt': new Date() }
                                            });
                                        }
                                    }
                                }
                            }
                        } catch(e) { /* ignore */ }
                    }

                    const reqFieldsNow = apptFieldsNow.filter(f => f.required);
                    const allReadyNow = reqFieldsNow.every(f => cfNow[f.fieldId] && cfNow[f.fieldId].trim());

                    if (allReadyNow) {
                        // Persist updated cf
                        await Conversation.updateOne({ _id: conversation._id }, { $set: { 'pendingBookingSlots.collectedFields': cfNow } });

                        // Check if user is confirming or we need to show summary first
                        const currentMsgLower = (content || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                        const isConfirmNow = content.trim().length <= 60 && /^(si|sip|ok|yes|confirm[ao]?|correcto|listo|dale|claro|va|bien|adelante|perfecto|anda|bueno|exacto|afirmativo|seguro|lo confirmo|confirmo|reserva|reservar|agenda|agendar|hagalo|si por favor|por favor|si confirmo|si ok|todo correcto)[\.\s!?]*$/i.test(currentMsgLower);
                        const existingApptNow = await Appointment.findOne({ conversationId: conversation._id, status: { $ne: 'cancelled' } });

                        if (isConfirmNow && !existingApptNow) {
                            // User confirmed — book it now
                            try {
                                const realBestNow = await findBestResource(chatbot._id.toString(), slotsNow.date, slotsNow.time, slotsNow.guestCount || 1, null);
                                if (realBestNow) {
                                    const scheduledAtNow = new Date(`${slotsNow.date}T${slotsNow.time}:00.000Z`);
                                    await Appointment.create({
                                        chatbotId: chatbot._id, workspaceId: chatbot.workspaceId,
                                        conversationId: conversation._id, resourceId: realBestNow.id,
                                        scheduledAt: scheduledAtNow, guestCount: slotsNow.guestCount || 1,
                                        durationMinutes: realBestNow.durationMinutes || 90,
                                        customerName: cfNow['name'] || '', customerEmail: cfNow['email'] || '',
                                        customerPhone: cfNow['phone'] || '',
                                        notes: apptFieldsNow.filter(f => cfNow[f.fieldId]).map(f => `${f.label}: ${cfNow[f.fieldId]}`).join(' | '),
                                        status: 'scheduled',
                                    });
                                    await Chatbot.updateOne({ _id: chatbot._id }, { $inc: { 'stats.totalAppointments': 1 } });
                                    await Conversation.updateOne({ _id: conversation._id }, { $set: { outcome: 'appointment' }, $unset: { pendingBookingSlots: '' } });
                                    const confirmedDateNow = scheduledAtNow.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
                                    const confirmMsg = await Message.create({ conversationId: conversation._id, chatbotId: chatbot._id, role: 'assistant', content: `✅ ¡Reserva confirmada, ${cfNow['name']}! Te esperamos el **${confirmedDateNow.charAt(0).toUpperCase() + confirmedDateNow.slice(1)} a las ${slotsNow.time}** (${slotsNow.guestCount || 1} persona${(slotsNow.guestCount||1) !== 1 ? 's' : ''}). ¿Hay algo más en que pueda ayudarte?`, createdAt: new Date() });
                                    return { success: true, data: { botMessage: confirmMsg } };
                                }
                            } catch(e) { logger.error('Pre-LLM booking error', { error: e.message }); }
                        } else if (!existingApptNow) {
                            // Not yet confirmed — show the summary (skip the LLM entirely to avoid wrong responses)
                            const dateStrNow = new Date(`${slotsNow.date}T${slotsNow.time}:00.000Z`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
                            const fieldSummaryNow = apptFieldsNow.filter(f => cfNow[f.fieldId]).map(f => `• *${f.label}:* ${cfNow[f.fieldId]}`).join('\n');
                            const summaryContent = `Perfecto, te confirmo los datos de tu reserva:\n\n📅 *${dateStrNow.charAt(0).toUpperCase() + dateStrNow.slice(1)}* a las *${slotsNow.time}*\n👥 *${slotsNow.guestCount || 1} persona${(slotsNow.guestCount||1) !== 1 ? 's' : ''}*\n${fieldSummaryNow}\n\n¿Todo correcto? Confirma para reservar.`;
                            const summaryMsgNow = await Message.create({ conversationId: conversation._id, chatbotId: chatbot._id, role: 'assistant', content: summaryContent, createdAt: new Date() });
                            return { success: true, data: { botMessage: summaryMsgNow } };
                        }
                    }
                }
            }

            // 10d. Date change detection — runs even when slots are partially filled
            // e.g. "Mejor el domingo" after date was already saved should override it
            if (chatbot.appointmentFields?.length > 0 && conversation.pendingBookingSlots?.date && content) {
                try {
                    const dateChangePatterns = /mejor|cambiar|cambio|prefiero|en cambio|para el|para la|el (lunes|martes|miércoles|jueves|viernes|sábado|domingo)|próximo|siguiente|ahora el/i;
                    if (dateChangePatterns.test(content)) {
                        const parsed10d = chrono.es.parse(content, new Date(), { forwardDate: true });
                        if (parsed10d.length > 0) {
                            const dt10d = parsed10d[0].start.date();
                            const today10d = new Date(); today10d.setHours(0,0,0,0);
                            if (dt10d >= today10d) {
                                const yyyy = dt10d.getFullYear();
                                const mm = String(dt10d.getMonth()+1).padStart(2,'0');
                                const dd = String(dt10d.getDate()).padStart(2,'0');
                                const hh = String(dt10d.getHours()).padStart(2,'0');
                                const mi = String(dt10d.getMinutes()).padStart(2,'0');
                                const newDate10d = `${yyyy}-${mm}-${dd}`;
                                const newTime10d = (hh !== '00' || mi !== '00') ? `${hh}:${mi}` : conversation.pendingBookingSlots.time;
                                if (newDate10d !== conversation.pendingBookingSlots.date || newTime10d !== conversation.pendingBookingSlots.time) {
                                    await Conversation.updateOne({ _id: conversation._id }, {
                                        $set: { 'pendingBookingSlots.date': newDate10d, 'pendingBookingSlots.time': newTime10d, 'pendingBookingSlots.savedAt': new Date() }
                                    });
                                    // Update in-memory so the rest of this request uses the new date
                                    conversation.pendingBookingSlots.date = newDate10d;
                                    conversation.pendingBookingSlots.time = newTime10d;
                                }
                            }
                        }
                    }
                } catch(e) { /* ignore */ }
            }

            // 11. Llamar OpenAI (con function calling si agendamiento activo)
            const openaiStartTime = Date.now();
            const features = chatbot.features || {};
            const calEnabled = features.appointments && chatbot.integrations?.calendar?.enabled;
            const activeResources = calEnabled ? await Resource.find({ chatbotId: chatbot._id, isActive: true }) : [];
            const appointmentTools = activeResources.length > 0 ? [buildAppointmentTool(chatbot)] : [];
            const isDineIn = !!(conversation.visitorMetadata?.tableId);
            const deliveryEnabled = !!(features.sales || chatbot.deliveryConfig?.enabled);
            const deliveryTools = deliveryEnabled && (chatbot.deliveryConfig?.enabled || isDineIn) ? [buildOrderTool(chatbot)] : [];
            const billTools     = deliveryEnabled && isDineIn ? [REQUEST_BILL_TOOL] : [];
            const quoteTools    = features.quotes && (chatbot.businessType === 'store' && chatbot.quoteConfig?.enabled) ? [GENERATE_QUOTE_TOOL] : [];
            const allTools = [...appointmentTools, ...deliveryTools, ...billTools, ...quoteTools];

            const response = await openaiService.generateResponse(
                chatbot,
                content,
                messages,
                allTools.length ? { tools: allTools } : {}
            );
            const openaiDuration = Date.now() - openaiStartTime;
            logger.performance('OpenAI Generation', openaiDuration, {
                tokensIn: response.tokensIn,
                tokensOut: response.tokensOut
            });

            // Handle function call: book_appointment
            let appointmentCreated = null;
            if (response.toolCall?.function?.name === 'book_appointment') {
                try {
                    const args = JSON.parse(response.toolCall.function.arguments);

                    // Guard: if the user's message is a question about availability, don't book — inform instead
                    const IS_AVAILABILITY_QUERY = /(\?|¿|¿hay|¿tienen|¿está|¿puedo|¿se puede|hay mesa|hay disponib|están disponib|tienen mesa|tienen lugar|tienen espacio|queda.*mesa|disponib)/i;
                    const currentUserMsg = content?.trim() || '';
                    if (IS_AVAILABILITY_QUERY.test(currentUserMsg) && currentUserMsg.includes('?') || (currentUserMsg.includes('¿') && !/(quiero|quisiera|necesito|me gustaría|me puede|reservar|agendar|hacer una reserva)/i.test(currentUserMsg))) {
                        // User is asking, not booking — reply with availability info in text
                        const availMsg = await Message.create({
                            conversationId: conversation._id,
                            chatbotId: chatbot._id,
                            role: 'assistant',
                            content: `¡Claro! Tenemos disponibilidad para esa fecha y hora. ¿Te gustaría hacer una reserva? Si es así, necesito tu nombre completo, teléfono y cuántas personas serán.`,
                            createdAt: new Date(),
                        });
                        return { success: true, data: { botMessage: availMsg } };
                    }

                    // ── Slot persistence: restore date/time from conversation if AI forgot them ──
                    // Helper: is a date string valid and in the future?
                    const isValidFutureDate = (d) => {
                        if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
                        return new Date(d + 'T00:00:00Z') >= new Date(new Date().toISOString().split('T')[0] + 'T00:00:00Z');
                    };
                    const isValidTime = (t) => t && /^\d{2}:\d{2}$/.test(t);

                    // Extract date/time from user messages using NLP (fallback when AI doesn't convert correctly)
                    const extractDateTimeFromHistory = () => {
                        const refDate = new Date();
                        // Build a combined text from all user messages
                        const userText = history.filter(m => m.role === 'user').map(m => m.content || '').reverse().join(' ');
                        try {
                            const results = chrono.es.parse(userText, refDate, { forwardDate: true });
                            if (results.length > 0) {
                                const r = results[0];
                                const dt = r.start.date();
                                // Only accept if date is today or future
                                const today = new Date(); today.setHours(0,0,0,0);
                                if (dt >= today) {
                                    const yyyy = dt.getFullYear();
                                    const mm = String(dt.getMonth()+1).padStart(2,'0');
                                    const dd = String(dt.getDate()).padStart(2,'0');
                                    const hh = String(dt.getHours()).padStart(2,'0');
                                    const mi = String(dt.getMinutes()).padStart(2,'0');
                                    return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` };
                                }
                            }
                        } catch(e) { /* ignore parse errors */ }
                        return null;
                    };

                    // Load saved slots from this conversation
                    const savedSlots = conversation.pendingBookingSlots || {};

                    // If AI provided valid new date/time, save them to conversation for future turns
                    if (isValidFutureDate(args.date) && isValidTime(args.time)) {
                        const newCount = args.guest_count || savedSlots.guestCount || 1;
                        if (args.date !== savedSlots.date || args.time !== savedSlots.time || newCount !== savedSlots.guestCount) {
                            await conversation.updateOne({ $set: { pendingBookingSlots: { date: args.date, time: args.time, guestCount: newCount, savedAt: new Date() } } });
                            savedSlots.date = args.date;
                            savedSlots.time = args.time;
                            savedSlots.guestCount = newCount;
                        }
                    }

                    // If AI forgot date/time, try: 1) saved slots, 2) NLP parse from history
                    if (!isValidFutureDate(args.date) || !isValidTime(args.time)) {
                        // Try saved slots first
                        if (isValidFutureDate(savedSlots.date) && isValidTime(savedSlots.time)) {
                            args.date = savedSlots.date;
                            args.time = savedSlots.time;
                        } else {
                            // Try NLP extraction from conversation history
                            const extracted = extractDateTimeFromHistory();
                            if (extracted) {
                                args.date = extracted.date;
                                args.time = extracted.time;
                                // Save for future turns
                                await conversation.updateOne({ $set: { pendingBookingSlots: { date: extracted.date, time: extracted.time, guestCount: args.guest_count || 1, savedAt: new Date() } } });
                                savedSlots.date = extracted.date;
                                savedSlots.time = extracted.time;
                            }
                        }
                    }

                    if (!args.guest_count && savedSlots.guestCount) {
                        args.guest_count = savedSlots.guestCount;
                    }

                    // If we still have no valid date/time at all, ask the user
                    if (!isValidFutureDate(args.date) || !isValidTime(args.time)) {
                        const noDateMsg = await Message.create({ conversationId: conversation._id, chatbotId: chatbot._id, role: 'assistant', content: 'Para hacer la reserva necesito saber la fecha y hora que prefieres. ¿Cuándo te gustaría venir?', createdAt: new Date() });
                        return { success: true, data: { botMessage: noDateMsg } };
                    }

                    const best = await findBestResource(
                        chatbot._id.toString(),
                        args.date,
                        args.time,
                        args.guest_count || 1,
                        args.preferred_resource || null
                    );
                    if (best) {
                        // Ensure date is in the future — fix year if AI hallucinated a past year
                        let dateStr = args.date;
                        const parsedDate = new Date(`${dateStr}T${args.time}:00.000Z`);
                        if (parsedDate < new Date()) {
                            const now = new Date();
                            const currentYear = now.getUTCFullYear();
                            const candidate = new Date(`${currentYear}-${dateStr.slice(5)}T${args.time}:00.000Z`);
                            dateStr = (candidate > now ? candidate : new Date(`${currentYear + 1}-${dateStr.slice(5)}T${args.time}:00.000Z`))
                                .toISOString().split('T')[0];
                        }
                        const scheduledAt = new Date(`${dateStr}T${args.time}:00.000Z`);
                                                // Map custom fields to standard appointment fields
                        // Use chatbot's configured fields — no hardcoded defaults
                        const fields = chatbot.appointmentFields || [];
                        const extraNotes = fields.filter(f => args[f.fieldId])
                            .map(f => `${f.label}: ${args[f.fieldId]}`).join(' | ');

                        // Build resolved values map: fieldId → value from args
                        const resolvedValues = {};
                        for (const f of fields) {
                            resolvedValues[f.fieldId] = args[f.fieldId] || args[`customer_${f.fieldId}`] || '';
                        }
                        // Convenience aliases for fields commonly used elsewhere in the code
                        const resolvedName  = resolvedValues['name']  || '';
                        const resolvedPhone = resolvedValues['phone'] || '';
                        const resolvedEmail = resolvedValues['email'] || '';

                        // Detect AI-invented placeholder values — brackets, braces, or generic words
                        const GENERIC_NAMES = /^(usuario|cliente|user|nombre|nombre completo|tu nombre|su nombre|nombre del cliente|ingresa tu nombre|name|full name|cliente \d+|person|persona|fulano|juan p[eé]rez|juan g[oó]mez|mar[ií]a garc[ií]a|john doe|jane doe|customer|invitado|guest|visitante|n\/a|none|null|undefined|example|ejemplo)$/i;
                        const GENERIC_PHONES = /^(123456789|000000000|111111111|999999999|teléfono|telefono|phone|número|numero|tu teléfono|\+?0+)$/i;
                        const isPlaceholderValue = (v, fieldId) => {
                            if (!v || v.trim() === '') return true;
                            if (/^\[.+\]$/.test(v.trim()) || /^\{.+\}$/.test(v.trim())) return true;
                            if (fieldId === 'name'  && GENERIC_NAMES.test(v.trim()))  return true;
                            if (fieldId === 'phone' && GENERIC_PHONES.test(v.trim())) return true;
                            return false;
                        };

                        // Guard: verify that name/phone values actually came from user messages (not AI-invented)
                        const userMsgTexts = history.filter(m => m.role === 'user').map(m => (m.content || '').toLowerCase());
                        const valueFoundInHistory = (val) => {
                            if (!val || val.trim().length < 2) return false;
                            const lower = val.trim().toLowerCase();
                            return userMsgTexts.some(msg => msg.includes(lower));
                        };

                        // Merge args with previously collected fields from slots
                        const collectedFields = savedSlots.collectedFields || {};
                        for (const f of fields) {
                            const argsVal = resolvedValues[f.fieldId] || '';
                            const savedVal = collectedFields[f.fieldId] || '';
                            // If AI provided a valid value this turn, update collected fields
                            if (!isPlaceholderValue(argsVal, f.fieldId) && valueFoundInHistory(argsVal)) {
                                collectedFields[f.fieldId] = argsVal;
                            }
                            // Use collected field value as fallback if current args don't have it
                            if (isPlaceholderValue(argsVal, f.fieldId) && !isPlaceholderValue(savedVal, f.fieldId)) {
                                resolvedValues[f.fieldId] = savedVal;
                            }
                        }
                        // Persist updated collectedFields to conversation
                        if (Object.keys(collectedFields).length > 0) {
                            await conversation.updateOne({ $set: { 'pendingBookingSlots.collectedFields': collectedFields } });
                        }

                        // Dynamic guard: check ALL required fields from chatbot config
                        const requiredFields = fields.filter(f => f.required === true);
                        for (const f of requiredFields) {
                            const val = resolvedValues[f.fieldId] || '';
                            // Field is missing if it's a placeholder OR if the value wasn't mentioned in user messages
                            const isMissing = (isPlaceholderValue(val, f.fieldId) || !valueFoundInHistory(val)) && !collectedFields[f.fieldId];
                            if (isMissing) {
                                const nameVal = resolvedValues['name'] || collectedFields['name'] || '';
                                const nameIsReal = nameVal && !isPlaceholderValue(nameVal, 'name');
                                const prefix = nameIsReal ? `Perfecto, ${nameVal}. ` : '';
                                response.content = `${prefix}Para confirmar la reserva necesito tu ${f.label.toLowerCase()}. ¿Me lo puedes indicar?`;
                                const missingMsg = await Message.create({ conversationId: conversation._id, chatbotId: chatbot._id, role: 'assistant', content: response.content, createdAt: new Date() });
                                return { success: true, data: { botMessage: missingMsg } };
                            }
                        }

                        // Guard: show summary and require explicit confirmation
                        // Use the CURRENT user message (content param) for confirmation check
                        // history[] doesn't include the current message yet (not saved to DB yet)
                        const lastUserMsg = (content || history.find(m => m.role === 'user')?.content || '').trim();
                        // Strip accents and check against confirmation patterns
                        const lowerMsg = lastUserMsg.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
                        const isConfirmation = lastUserMsg.length <= 60 && /^(sip?|si|ok|yes|confirm[ao]?|correcto|listo|dale|claro|va|bien|adelante|perfecto|anda|bueno|exacto|afirmativo|seguro|obvio|por supuesto|claro que si|si confirmo|si ok|si dale|si listo|si perfecto|si todo correcto|todo correcto|asi es|es correcto|lo confirmo|confirmo|reserva|reservar|agenda|agendar|hagalo|si hagalo|si por favor|por favor|va!)[\s!.]*$/i.test(lowerMsg);
                        if (!isConfirmation) {
                            const confirmedDateStr2 = new Date(`${dateStr}T${args.time}:00.000Z`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
                            // Build summary dynamically from all fields that have a value
                            const fieldSummary = fields.filter(f => resolvedValues[f.fieldId] && !isPlaceholderValue(resolvedValues[f.fieldId], f.fieldId))
                                .map(f => `• *${f.label}:* ${resolvedValues[f.fieldId]}`).join('\n');
                            response.content = `Perfecto, te confirmo los datos de tu reserva:\n\n📅 *${confirmedDateStr2.charAt(0).toUpperCase() + confirmedDateStr2.slice(1)}* a las *${args.time}*\n👥 *${args.guest_count || 1} persona${(args.guest_count || 1) !== 1 ? 's' : ''}*\n${fieldSummary}\n\n¿Todo correcto? Confirma para reservar.`;
                            const summaryMsg = await Message.create({ conversationId: conversation._id, chatbotId: chatbot._id, role: 'assistant', content: response.content, createdAt: new Date() });
                            return { success: true, data: { botMessage: summaryMsg } };
                        }

                        // Guard: prevent duplicate appointments for the same conversation
                        const existingAppt = await Appointment.findOne({
                            conversationId: conversation._id,
                            status: { $ne: 'cancelled' },
                        });
                        if (existingAppt) {
                            // Update appointment with real name/phone if it had placeholders before
                            const updates = {};
                            const needsNameUpdate = !existingAppt.customerName || existingAppt.customerName.startsWith('[') || existingAppt.customerName.toLowerCase().includes('nombre');
                            const needsPhoneUpdate = !existingAppt.customerPhone || existingAppt.customerPhone.startsWith('[');
                            if (needsNameUpdate && resolvedName)  updates.customerName  = resolvedName;
                            if (needsPhoneUpdate && resolvedPhone) updates.customerPhone = resolvedPhone;
                            if (extraNotes) updates.notes = extraNotes;
                            if (Object.keys(updates).length) {
                                await Appointment.updateOne({ _id: existingAppt._id }, { $set: updates });
                                Object.assign(existingAppt, updates);
                            }
                            const confirmedDateStr = existingAppt.scheduledAt.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
                            const displayName = existingAppt.customerName?.startsWith('[') ? '' : existingAppt.customerName;
                            response.content = `Tu reserva ya está confirmada ✅${displayName ? ` — **${displayName}**` : ''}, el **${confirmedDateStr} a las ${args.time || existingAppt.scheduledAt.toISOString().slice(11,16)}** (${existingAppt.guestCount} personas).${extraNotes ? ` Anotamos: ${extraNotes}.` : ''} ¿Algo más en que pueda ayudarte?`;
                            const skipMsg = await Message.create({ conversationId: conversation._id, chatbotId: chatbot._id, role: 'assistant', content: response.content, createdAt: new Date() });
                            return { success: true, data: { botMessage: skipMsg } };
                        }

                        appointmentCreated = await Appointment.create({
                            chatbotId:    chatbot._id,
                            workspaceId:  chatbot.workspaceId,
                            conversationId: conversation._id,
                            resourceId:   best.id,
                            guestCount:   args.guest_count || 1,
                            scheduledAt,
                            durationMinutes: best.durationMinutes || 90,
                            customerName:  resolvedName,
                            customerEmail: resolvedEmail,
                            customerPhone: resolvedPhone,
                            notes: extraNotes || args.notes || '',
                            status: 'scheduled',
                        });
                        await Chatbot.updateOne({ _id: chatbot._id }, { $inc: { 'stats.totalAppointments': 1 } });
                        const confirmedDateStr = scheduledAt.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
                        response.content = `✅ ¡Reserva confirmada, ${resolvedName}! Te esperamos el **${confirmedDateStr} a las ${args.time}** (${args.guest_count || 1} ${args.guest_count === 1 ? 'persona' : 'personas'}). Recibirás una confirmación. ¿Hay algo más en lo que pueda ayudarte?`;
                    } else {
                        response.content = `Lo siento, ese horario ya no está disponible. ¿Te acomoda otro horario?`;
                    }
                } catch (fnErr) {
                    logger.error('Error processing book_appointment tool call', { error: fnErr.message });
                    response.content = `Hubo un problema al confirmar tu reserva. Por favor intenta de nuevo.`;
                }
            }

            // Handle create_order tool call
            if (response.toolCall?.function?.name === 'create_order') {
                try {
                    const args = JSON.parse(response.toolCall.function.arguments);
                    const delivery = chatbot.deliveryConfig || {};
                    const tableInfo = conversation.visitorMetadata || {};
                    const isDineInOrder = !!(tableInfo.tableId);

                    // Guard: delivery orders must have an address that came from the user
                    const isDeliveryIntent = !isDineInOrder && args.delivery_address !== 'retiro';
                    const addrArg = (args.delivery_address || '').trim();
                    const missingAddress = isDeliveryIntent && addrArg.length < 5;
                    // Also reject hallucinated addresses: verify address words appear in user messages
                    const allUserTexts = [content, ...history.filter(m => m.role === 'user').map(m => m.content || '')].join(' ').toLowerCase();
                    const addrWords = addrArg.toLowerCase().split(/\s+/).filter(w => w.length > 3);
                    const addrFoundInUserMsgs = addrWords.length > 0 && addrWords.some(w => allUserTexts.includes(w));
                    const addressHallucinated = isDeliveryIntent && addrArg.length >= 5 && !addrFoundInUserMsgs;
                    if (missingAddress || addressHallucinated) {
                        const askAddrMsg = await Message.create({ conversationId: conversation._id, chatbotId: chatbot._id, role: 'assistant', content: 'Para procesar tu pedido a domicilio necesito tu dirección completa (calle, número y barrio). ¿Me la indicas?', createdAt: new Date() });
                        return { success: true, data: { botMessage: askAddrMsg } };
                    }

                    // Guard: if there's already a 'new' order for this conversation, update it instead of creating a new one
                    const existingOrder = await Order.findOne({ conversationId: conversation._id, status: 'new' }).lean();
                    if (existingOrder) {
                        // Update the existing order with latest data from AI (address, name, phone, items)
                        const updItems = args.items.map(i => ({ name: i.name, quantity: i.quantity, unitPrice: i.unit_price, totalPrice: i.unit_price * i.quantity, notes: i.notes || '', variant: i.variant || '', productId: i.product_id || null }));
                        const updSubtotal = updItems.reduce((s, i) => s + i.totalPrice, 0);
                        const updDeliveryCost = isDineInOrder ? 0 : (delivery.deliveryCost || 0);
                        const updTotal = updSubtotal + updDeliveryCost;
                        const updAddr = isDineInOrder ? `Mesa: ${tableInfo.tableName}` : (args.delivery_address || existingOrder.deliveryAddress || '');
                        await Order.updateOne({ _id: existingOrder._id }, { $set: {
                            items: updItems, subtotal: updSubtotal, deliveryCost: updDeliveryCost, total: updTotal,
                            deliveryAddress: updAddr,
                            customerName: args.customer_name || existingOrder.customerName || '',
                            customerPhone: args.customer_phone || existingOrder.customerPhone || '',
                            notes: args.notes || existingOrder.notes || '',
                        }});
                        const updItemsText = updItems.map(i => `${i.quantity}× ${i.name}${i.variant ? ` [${i.variant}]` : ''}`).join(', ');
                        response.content = isDineInOrder
                            ? `✅ ¡Pedido actualizado! 📋 **Pedido #${existingOrder.orderNumber}:** ${updItemsText}\n💰 **Total:** Bs. ${updTotal.toLocaleString()}`
                            : `✅ ¡Pedido confirmado! 🎉\n\n📦 **Pedido #${existingOrder.orderNumber}:** ${updItemsText}\n📍 **${updAddr}**\n💰 **Total:** Bs. ${updTotal.toLocaleString()}${updDeliveryCost > 0 ? ` (incluye Bs. ${updDeliveryCost} delivery)` : ''}\n⏱ **Tiempo estimado:** ${delivery.estimatedMinutes || 45} min\n\n¡Estamos en eso! ¿Algo más?`;
                        const updMsg = await Message.create({ conversationId: conversation._id, chatbotId: chatbot._id, role: 'assistant', content: response.content, createdAt: new Date() });
                        return { success: true, data: { botMessage: updMsg } };
                    }

                    const items = args.items.map(i => ({
                        name:       i.name,
                        quantity:   i.quantity,
                        unitPrice:  i.unit_price,
                        totalPrice: i.unit_price * i.quantity,
                        notes:      i.notes || '',
                        variant:    i.variant || '',
                        productId:  i.product_id || null,
                    }));

                    // For store: validate stock before confirming order
                    if (chatbot.businessType === 'store') {
                        const stockCheck = await stockService.checkOrderStock(items);
                        if (!stockCheck.valid) {
                            const issueMsg = stockCheck.issues.map(iss => `• ${iss.message}`).join('\n');
                            response.content = `Lo siento, hay un problema con tu pedido:\n\n${issueMsg}\n\n¿Deseas ajustar las cantidades?`;
                            // Early return — skip order creation
                            const skipMsg = await Message.create({ conversationId: conversation._id, chatbotId: chatbot._id, role: 'assistant', content: response.content, createdAt: new Date() });
                            return { success: true, data: { botMessage: skipMsg } };
                        }
                    }

                    const subtotal = items.reduce((s, i) => s + i.totalPrice, 0);
                    const deliveryCost = isDineInOrder ? 0 : (delivery.deliveryCost || 0);
                    const total = subtotal + deliveryCost;

                                        const order = await Order.create({
                        chatbotId:        chatbot._id,
                        workspaceId:      chatbot.workspaceId,
                        conversationId:   conversation._id,
                        orderType:        isDineInOrder ? 'dine_in' : (args.delivery_address === 'retiro' ? 'pickup' : 'delivery'),
                        tableId:          tableInfo.tableId || null,
                        tableName:        tableInfo.tableName || null,
                        items,
                        subtotal,
                        deliveryCost,
                        total,
                        customerName:     args.customer_name || (isDineInOrder ? 'Cliente en mesa' : ''),
                        customerPhone:    args.customer_phone || '',
                        customerEmail:    args.customer_email || '',
                        deliveryAddress:  isDineInOrder ? `Mesa: ${tableInfo.tableName}` : (args.delivery_address || ''),
                        deliveryZone:     args.delivery_zone || '',
                        estimatedMinutes: delivery.estimatedMinutes || 20,
                        notes:            args.notes || '',
                        status:           'new',
                    });

                    // Decrement stock for store after order confirmed
                    if (chatbot.businessType === 'store') {
                        setImmediate(() => stockService.decrementOrderStock(items));
                    }

                    const itemsText = items.map(i => `${i.quantity}× ${i.name}${i.variant ? ` [${i.variant}]` : ''}${i.notes ? ` (${i.notes})` : ''}`).join(', ');
                    if (isDineInOrder) {
                        response.content = `✅ ¡Tu pedido está registrado! 🎉\n\n📋 **Pedido #${order.orderNumber}:** ${itemsText}\n💰 **Total:** Bs. ${total.toLocaleString()}\n\nEl equipo de cocina ya recibió tu pedido. Cuando quieras pedir algo más o la cuenta, ¡aquí estoy! 😊`;
                    } else {
                        const confirmedDateStr = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
                        response.content = `✅ ¡Pedido confirmado! 🎉\n\n📦 **Pedido #${order.orderNumber}:** ${itemsText}\n📍 **${args.delivery_address}**\n💰 **Total:** Bs. ${total.toLocaleString()}${deliveryCost > 0 ? ` (incluye Bs. ${deliveryCost} delivery)` : ''}\n⏱ **Tiempo estimado:** ${delivery.estimatedMinutes || 45} min\n\n¡Estamos en eso! ¿Algo más?`;
                    }
                } catch (fnErr) {
                    logger.error('Error processing create_order tool call', { error: fnErr.message });
                    response.content = `Hubo un problema al registrar tu pedido. Por favor intenta de nuevo.`;
                }
            }

            // Handle generate_quote tool call (store)
            if (response.toolCall?.function?.name === 'generate_quote') {
                try {
                    const args = JSON.parse(response.toolCall.function.arguments);
                    const qConfig = chatbot.quoteConfig || {};

                    const items = args.items.map(i => {
                        // Apply volume discount
                        const totalQty = i.quantity;
                        let discountPct = 0;
                        if (qConfig.volumeDiscounts?.length) {
                            const tier = [...qConfig.volumeDiscounts]
                                .sort((a, b) => b.minQty - a.minQty)
                                .find(d => totalQty >= d.minQty);
                            if (tier) discountPct = tier.discountPct;
                        }
                        const unitPrice = i.unit_price;
                        const discountedPrice = unitPrice * (1 - discountPct / 100);
                        return {
                            description: `${i.name}${i.variant ? ` [${i.variant}]` : ''}`,
                            quantity:    i.quantity,
                            unitPrice:   parseFloat(discountedPrice.toFixed(2)),
                            total:       parseFloat((discountedPrice * i.quantity).toFixed(2)),
                            discount:    discountPct > 0 ? `${discountPct}% desc.` : null,
                        };
                    });

                    const subtotal = items.reduce((s, i) => s + i.total, 0);
                    const taxAmt   = qConfig.taxRate ? subtotal * (qConfig.taxRate / 100) : 0;
                    const total    = subtotal + taxAmt;

                    const quote = await Quote.create({
                        chatbotId:    chatbot._id,
                        workspaceId:  chatbot.workspaceId,
                        conversationId: conversation._id,
                        quoteNumber: `QT-${Date.now()}-${Math.random().toString(36).substr(2,6).toUpperCase()}`,
                        items,
                        subtotal: parseFloat(subtotal.toFixed(2)),
                        tax:      parseFloat(taxAmt.toFixed(2)),
                        total:    parseFloat(total.toFixed(2)),
                        currency: 'CLP',
                        customerData: { name: args.customer_name, email: args.customer_email, phone: args.customer_phone || '' },
                        shareToken: crypto.randomBytes(16).toString('hex'),
                        expiresAt: new Date(Date.now() + (qConfig.validityDays || 30) * 86400000),
                        status: 'draft',
                    });

                    response.content = `✅ ¡Cotización generada! 📋\n\n**Cotización #${quote.quoteNumber}**\n${items.map(i => `• ${i.quantity}× ${i.description}: $${i.total.toLocaleString()}${i.discount ? ` (${i.discount})` : ''}`).join('\n')}\n\n**Total: $${total.toLocaleString()}**${taxAmt > 0 ? ` (incluye ${qConfig.taxRate}% IVA)` : ''}\nVálida por ${qConfig.validityDays || 30} días.\n\nTe enviaremos la cotización formal a ${args.customer_email}. ¿Tienes alguna pregunta?`;
                } catch (fnErr) {
                    logger.error('Error processing generate_quote tool call', { error: fnErr.message });
                    response.content = `Hubo un problema al generar la cotización. Por favor intenta de nuevo.`;
                }
            }

            // Handle request_bill tool call
            if (response.toolCall?.function?.name === 'request_bill') {
                try {
                    const args = JSON.parse(response.toolCall.function.arguments || '{}');
                    const tableInfo = conversation.visitorMetadata || {};
        
                    // Find all orders for this table in this conversation
                    const tableOrders = await Order.find({
                        conversationId: conversation._id,
                        orderType: 'dine_in',
                        status: { $nin: ['cancelled'] },
                    });

                    // Mark bill as requested
                    await Order.updateMany(
                        { conversationId: conversation._id, orderType: 'dine_in', billRequested: false },
                        { billRequested: true, billRequestedAt: new Date() }
                    );

                    const grandTotal = tableOrders.reduce((s, o) => s + (o.total || 0), 0);
                    const allItems = tableOrders.flatMap(o => o.items || []);
                    const itemsSummary = allItems.map(i => `${i.quantity}× ${i.name}: Bs. ${i.totalPrice}`).join('\n');

                    response.content = `🧾 **Cuenta - ${tableInfo.tableName || 'Tu mesa'}**\n\n${itemsSummary || 'Sin ítems registrados'}\n\n**Total: Bs. ${grandTotal.toLocaleString()}**\n\nHemos notificado al equipo para traerte la cuenta. ¡Gracias por visitarnos! 😊`;
                } catch (fnErr) {
                    logger.error('Error processing request_bill tool call', { error: fnErr.message });
                    response.content = `Hubo un problema al procesar tu solicitud. Por favor llama a un mesero.`;
                }
            }

            // 10b. Active field collection + false-confirmation interceptor
            // Run on EVERY text response when appointments are enabled — extracts field values from user messages
            // and intercepts false "confirmed" text responses that didn't go through book_appointment
            if (!response.toolCall && chatbot.appointmentFields?.length > 0) {
                const apptConfig = chatbot.schedulingConfig || chatbot.appointmentConfig || {};
                if (apptConfig.enabled !== false) {
                    // Reload slots fresh from DB (they may have been updated inside book_appointment path)
                    const freshConv = await Conversation.findById(conversation._id).lean();
                    const slots = freshConv?.pendingBookingSlots || {};
                    const cf = { ...(slots.collectedFields || {}) };

                    // ── Extract field values from ALL user messages ──
                    const allUserMsgs = history.filter(m => m.role === 'user').map(m => m.content || '');
                    // Also include current user message (content var) which may not be in history yet
                    if (content && !allUserMsgs.includes(content)) allUserMsgs.push(content);

                    const apptFields = chatbot.appointmentFields || [];

                    // Phone: extract any phone number from user messages
                    const phoneField = apptFields.find(f => f.fieldId === 'phone');
                    if (phoneField && !cf['phone']) {
                        const phoneMatch = allUserMsgs.join(' ').match(/(?:^|\s)(\+?[0-9]{7,15})(?:\s|$)/);
                        if (phoneMatch) cf['phone'] = phoneMatch[1].trim();
                    }

                    // Name: extract from "mi nombre es X Y", "me llamo X Y", "soy X Y"
                    // Process each message individually and anchor to end of message to avoid grabbing next sentence
                    const nameField = apptFields.find(f => f.fieldId === 'name');
                    if (nameField && !cf['name']) {
                        for (const msg of allUserMsgs) {
                            const nameMatch = msg.trim().match(/(?:mi nombre es|me llamo|soy)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)\s*[.,!?]?\s*$/i);
                            if (nameMatch) { cf['name'] = nameMatch[1].trim(); break; }
                        }
                    }

                    // Also extract date/time from user messages if not yet saved
                    let slotsDate = slots.date;
                    let slotsTime = slots.time;
                    const isValidFutureDate2 = (d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(d + 'T00:00:00Z') >= new Date(new Date().toISOString().split('T')[0] + 'T00:00:00Z');
                    const isValidTime2 = (t) => t && /^\d{2}:\d{2}$/.test(t);
                    if (!isValidFutureDate2(slotsDate) || !isValidTime2(slotsTime)) {
                        try {
                            const refNow = new Date();
                            const userText2 = allUserMsgs.join(' ');
                            const results2 = chrono.es.parse(userText2, refNow, { forwardDate: true });
                            if (results2.length > 0) {
                                const dt2 = results2[0].start.date();
                                const today2 = new Date(); today2.setHours(0,0,0,0);
                                if (dt2 >= today2) {
                                    slotsDate = `${dt2.getFullYear()}-${String(dt2.getMonth()+1).padStart(2,'0')}-${String(dt2.getDate()).padStart(2,'0')}`;
                                    slotsTime = `${String(dt2.getHours()).padStart(2,'0')}:${String(dt2.getMinutes()).padStart(2,'0')}`;
                                }
                            }
                        } catch(e) {}
                    }

                    // Persist extracted data if changed
                    const cfChanged = JSON.stringify(cf) !== JSON.stringify(slots.collectedFields || {});
                    const dateChanged = slotsDate !== slots.date || slotsTime !== slots.time;
                    if (cfChanged || dateChanged) {
                        await Conversation.updateOne({ _id: conversation._id }, { $set: {
                            'pendingBookingSlots.collectedFields': cf,
                            ...(slotsDate && { 'pendingBookingSlots.date': slotsDate }),
                            ...(slotsTime && { 'pendingBookingSlots.time': slotsTime }),
                            ...((!slots.guestCount && slots.guestCount !== 0) ? { 'pendingBookingSlots.guestCount': 1 } : {}),
                        }});
                    }

                    // ── False confirmation interceptor ──
                    const FALSE_CONFIRM_PATTERN = /reserva.*(confirmada|lista|registrada|hecha|agendada|procesada)|confirmada.*reserva|te esperamos.*el|cita.*confirmada|tu.*reserva.*está/i;
                    if (FALSE_CONFIRM_PATTERN.test(response.content || '')) {
                        const hasDate = isValidFutureDate2(slotsDate);
                        const hasTime = isValidTime2(slotsTime);
                        const reqFields = apptFields.filter(f => f.required);
                        const allFieldsPresent = reqFields.every(f => cf[f.fieldId] && cf[f.fieldId].trim());

                        if (hasDate && hasTime && allFieldsPresent) {
                            // All data ready — do the actual booking
                            try {
                                const guestCnt = slots.guestCount || 1;
                                const realBest = await findBestResource(chatbot._id.toString(), slotsDate, slotsTime, guestCnt, null);
                                if (realBest) {
                                    const existingAppt2 = await Appointment.findOne({ conversationId: conversation._id, status: { $ne: 'cancelled' } });
                                    if (!existingAppt2) {
                                        const scheduledAt2 = new Date(`${slotsDate}T${slotsTime}:00.000Z`);
                                        await Appointment.create({
                                            chatbotId: chatbot._id,
                                            workspaceId: chatbot.workspaceId,
                                            conversationId: conversation._id,
                                            resourceId: realBest.id,
                                            scheduledAt: scheduledAt2,
                                            guestCount: guestCnt,
                                            durationMinutes: realBest.durationMinutes || 90,
                                            customerName:  cf['name']  || '',
                                            customerEmail: cf['email'] || '',
                                            customerPhone: cf['phone'] || '',
                                            notes: apptFields.filter(f => cf[f.fieldId]).map(f => `${f.label}: ${cf[f.fieldId]}`).join(' | '),
                                            status: 'scheduled',
                                        });
                                        await Chatbot.updateOne({ _id: chatbot._id }, { $inc: { 'stats.totalAppointments': 1 } });
                                        await Conversation.updateOne({ _id: conversation._id }, { $set: { outcome: 'appointment' }, $unset: { pendingBookingSlots: '' } });
                                        const confirmedDate3 = scheduledAt2.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
                                        const displayName3 = cf['name'] || '';
                                        response.content = `✅ ¡Reserva confirmada${displayName3 ? `, ${displayName3}` : ''}! Te esperamos el **${confirmedDate3.charAt(0).toUpperCase() + confirmedDate3.slice(1)} a las ${slotsTime}** (${guestCnt} persona${guestCnt !== 1 ? 's' : ''}). ¿Hay algo más en que pueda ayudarte?`;
                                        logger.info('Appointment created via false-confirmation interceptor', { name: cf['name'], date: slotsDate, time: slotsTime });
                                    }
                                }
                            } catch(interceptErr) {
                                logger.error('Error in false-confirmation interceptor', { error: interceptErr.message });
                            }
                        } else if (!hasDate || !hasTime) {
                            // No date saved — replace false confirmation with a date request
                            response.content = 'Para hacer la reserva necesito saber la fecha y hora que prefieres. ¿Cuándo te gustaría venir?';
                        } else {
                            // Fields still missing — replace false confirmation with the next question
                            const missingFieldNow = reqFields.find(f => !cf[f.fieldId] || !cf[f.fieldId].trim());
                            if (missingFieldNow) {
                                const nameKnown = cf['name'] && cf['name'].trim();
                                const prefix2 = nameKnown ? `Perfecto, ${cf['name']}. ` : '';
                                response.content = `${prefix2}Para confirmar la reserva necesito tu ${missingFieldNow.label.toLowerCase()}. ¿Me lo puedes indicar?`;
                            }
                        }
                    }
                }
            }

            // 11. Guardar respuesta del bot
            const botMessage = await Message.create({
                conversationId: conversation._id,
                chatbotId: chatbot._id,
                role: 'assistant',
                content: response.content || '...',
                metadata: {
                    ragChunksUsed: ragChunks.map(c => c.chunkId),
                    ragSimilarityScores: ragChunks.map(c => c.similarity),
                    productsReferenced: products.map(p => p._id || p.id),
                    tokensIn: response.tokensIn,
                    tokensOut: response.tokensOut,
                    model: response.model,
                    totalLatencyMs: Date.now() - startTime,
                    ragLatencyMs: ragDuration,
                    openaiLatencyMs: openaiDuration,
                    cost: response.cost,
                    cached: false
                },
                createdAt: new Date()
            });

            // 12. Cachear respuesta + limpiar error de OpenAI si había uno
            // Don't cache responses for bots with appointment/order flows — they're context-dependent
            if (!skipCache) advancedRag.cacheResponse(botId, content, response.content);
            if (chatbot.openaiError?.code) {
                setImmediate(() => Chatbot.updateOne({ _id: chatbot._id }, { $set: { 'openaiError.code': null, 'openaiError.detectedAt': null } }));
            }

            // 13. Actualizar estadísticas de la conversación
            conversation.messageCount = (conversation.messageCount || 0) + 2;
            conversation.lastMessageAt = new Date();
            await conversation.save();

            // 14. Enviar a canales sociales (asincrónico)
            let whatsappWarning = null;
            let instagramWarning = null;

            if (conversation.source === 'whatsapp') {
                if (!chatbot?.integrations?.whatsapp?.enabled || !chatbot?.integrations?.whatsapp?.accessToken) {
                    whatsappWarning = {
                        warning: 'WHATSAPP_NOT_CONFIGURED',
                        warningMessage: '⚠️ Este chatbot no tiene WhatsApp Business API configurado.'
                    };
                } else {
                    setImmediate(async () => {
                        try {
                            await whatsAppInstance.sendMessage(
                                chatbot.integrations.whatsapp.phoneNumberId,
                                chatbot.integrations.whatsapp.accessToken,
                                conversation.visitorId,
                                response.content
                            );
                        } catch (err) {
                            logger.error('Error sending WhatsApp message', {
                                error: err.message,
                                botId,
                                visitorId: conversation.visitorId
                            });
                        }
                    });
                }
            }

            if (conversation.source === 'instagram') {
                if (!chatbot?.integrations?.instagram?.enabled || !chatbot?.integrations?.instagram?.accessToken) {
                    instagramWarning = {
                        warning: 'INSTAGRAM_NOT_CONFIGURED',
                        warningMessage: '⚠️ Este chatbot no tiene Instagram configurado.'
                    };
                } else {
                    setImmediate(async () => {
                        try {
                            await socialService.sendInstagramMessage(
                                chatbot._id,
                                conversation.visitorId,
                                response.content
                            );
                        } catch (err) {
                            logger.error('Error sending Instagram message', {
                                error: err.message,
                                botId,
                                visitorId: conversation.visitorId
                            });
                        }
                    });
                }
            }

            // 15. Cotización automática deshabilitada (requiere confirmación del usuario)
            // const autoQuote = await this.tryAutoGenerateQuote(
            //     conversationId,
            //     content,
            //     response.content
            // );
            const autoQuote = null;

            // Si se generó una cotización, agregar mensaje especial en la conversación
            if (autoQuote) {
                await Message.create({
                    conversationId: conversation._id,
                    chatbotId: chatbot._id,
                    role: 'system',
                    messageType: 'quote_generated',
                    content: `✅ Cotización #${autoQuote.quoteNumber} generada y enviada por email\n💰 Total: $${autoQuote.total?.toLocaleString('es-CL')} CLP`,
                    metadata: {
                        quoteId: autoQuote._id,
                        quoteNumber: autoQuote.quoteNumber,
                        autoGenerated: true
                    },
                    createdAt: new Date()
                });

                // Actualizar estado de la conversación
                await Conversation.updateOne(
                    { _id: conversationId },
                    {
                        $push: { quotes: autoQuote._id },
                        outcome: 'quote'
                    }
                );
            }

            const totalDuration = Date.now() - startTime;
            logger.info('Message processed successfully', {
                botId,
                conversationId,
                contentLength: content.length,
                totalDurationMs: totalDuration,
                ragChunksUsed: ragChunks.length,
                autoQuoteGenerated: !!autoQuote
            });

            const responseData = {
                success: true,
                message: 'Mensaje procesado',
                data: {
                    botMessage: {
                        _id: botMessage._id,
                        content: botMessage.content,
                        role: 'assistant'
                    },
                    tokensUsed: response.tokensIn + response.tokensOut,
                    cost: response.cost,
                    latencyMs: totalDuration,
                    ragChunksUsed: ragChunks.length,
                    autoQuoteGenerated: !!autoQuote
                }
            };

            // Agregar información de cotización si se generó
            if (quoteData) {
                responseData.quote = {
                    _id: quoteData._id,
                    quoteNumber: quoteData.quoteNumber,
                    total: quoteData.total,
                    itemsCount: quoteData.items?.length || 0,
                    status: quoteData.status,
                    shareToken: quoteData.shareToken
                };

                // Agregar mensaje de cotización a la respuesta del bot
                const quoteMessage = QuoteGeneratorService.getQuoteResponseMessage(quoteData);
                if (quoteMessage) {
                    responseData.data.botMessage.content += `\n\n${quoteMessage}`;
                }
            }

            if (whatsappWarning) {
                responseData.warning = whatsappWarning.warning;
                responseData.warningMessage = whatsappWarning.warningMessage;
            }

            if (instagramWarning) {
                responseData.warning = instagramWarning.warning;
                responseData.warningMessage = instagramWarning.warningMessage;
            }

            return responseData;
        } catch (error) {
            logger.critical('Error in sendMessage', error, {
                conversationId,
                botId,
                contentLength: content?.length
            });

            // Distinguish OpenAI quota errors from generic errors
            if (error.message === 'OPENAI_QUOTA_EXCEEDED' || error.message === 'OPENAI_INVALID_KEY') {
                // Persist error to chatbot so admin can see it in dashboard
                setImmediate(() => Chatbot.updateOne(
                    { _id: botId },
                    { $set: { 'openaiError.code': error.message, 'openaiError.detectedAt': new Date() } }
                ));
                return {
                    success: false,
                    errorCode: error.message,
                    message: error.message,
                };
            }

            return {
                success: false,
                message: error.message || 'Error procesando tu mensaje'
            };
        }
    };

    captureLead = async (conversationId, leadData) => {
        try {
            const conversation = await Conversation.findById(conversationId);
            if (!conversation) {
                return { success: false, message: 'Conversación no encontrada' };
            }

            const lead = new Lead({
                chatbotId: conversation.chatbotId,
                workspaceId: conversation.workspaceId,
                conversationId,
                name: leadData.name,
                email: leadData.email,
                phone: leadData.phone,
                company: leadData.company,
                source: 'chatbot',
                message: leadData.message
            });

            await lead.save();

            // Actualizar estadísticas del chatbot
            await Chatbot.updateOne(
                { _id: conversation.chatbotId },
                { $inc: { 'stats.totalLeads': 1 } }
            );

            // Enviar email de confirmación
            setImmediate(async () => {
                await emailService.sendLeadConfirmation({
                    name: leadData.name,
                    email: leadData.email,
                    phone: leadData.phone,
                    company: leadData.company
                });
            });

            return {
                success: true,
                message: 'Lead capturado exitosamente',
                data: { lead }
            };
        } catch (error) {
            console.error('❌ EmbedService.captureLead:', error);
            return { success: false, message: error.message };
        }
    };

    requestQuote = async (conversationId, quoteData) => {
        try {
            const conversation = await Conversation.findById(conversationId);
            if (!conversation) {
                return { success: false, message: 'Conversación no encontrada' };
            }

            const chatbot = await Chatbot.findById(conversation.chatbotId);

            // Generar número de cotización
            const quoteCount = await Quote.countDocuments({ chatbotId: conversation.chatbotId });
            const quoteNumber = `QT-${conversation.chatbotId.toString().slice(-6)}-${String(quoteCount + 1).padStart(4, '0')}`;

            const quote = new Quote({
                chatbotId: conversation.chatbotId,
                workspaceId: conversation.workspaceId,
                conversationId,
                quoteNumber,
                items: quoteData.items || [],
                subtotal: quoteData.subtotal || 0,
                tax: quoteData.tax || 0,
                total: quoteData.total || 0,
                currency: quoteData.currency || 'CLP',
                customerData: quoteData.customerData || {},
                status: 'draft'
            });

            await quote.save();

            // Actualizar estadísticas del chatbot
            await Chatbot.updateOne(
                { _id: conversation.chatbotId },
                { $inc: { 'stats.totalQuotes': 1 } }
            );

            // Enviar email de cotización asincronamente
            setImmediate(async () => {
                try {
                    const customerEmail = quoteData.customerData?.email || quoteData.customerData?.customerEmail;
                    const customerName = quoteData.customerData?.name || quoteData.customerData?.customerName;

                    if (customerEmail) {
                        await emailService.sendQuote({
                            quoteNumber,
                            customerName: customerName || 'Cliente',
                            customerEmail,
                            items: quoteData.items || [],
                            subtotal: quoteData.subtotal || 0,
                            tax: quoteData.tax || 0,
                            total: quoteData.total || 0,
                            currency: quoteData.currency || 'CLP'
                        }).catch(err => {
                            console.warn('Email de cotización no se pudo enviar:', err);
                        });
                    }
                } catch (err) {
                    console.warn('Error al enviar email de cotización:', err);
                }
            });

            const response = {
                success: true,
                message: 'Cotización creada exitosamente',
                data: { quote }
            };

            return response;
        } catch (error) {
            console.error('❌ EmbedService.requestQuote:', error);
            return { success: false, message: error.message };
        }
    };

    requestAppointment = async (conversationId, appointmentData) => {
        try {
            const conversation = await Conversation.findById(conversationId);
            if (!conversation) {
                return { success: false, message: 'Conversación no encontrada' };
            }

            const chatbot = await Chatbot.findById(conversation.chatbotId);

            // Auto-assign resource if resources exist
            let resourceId = null;
                        if (appointmentData.date && appointmentData.time) {
                const best = await findBestResource(
                    conversation.chatbotId.toString(),
                    appointmentData.date,
                    appointmentData.time,
                    parseInt(appointmentData.guestCount) || 1
                );
                if (best) resourceId = best.id;
            }

            const appointment = new Appointment({
                chatbotId: conversation.chatbotId,
                workspaceId: conversation.workspaceId,
                conversationId,
                resourceId,
                guestCount: appointmentData.guestCount || 1,
                scheduledAt: appointmentData.scheduledAt,
                durationMinutes: appointmentData.durationMinutes || 60,
                reason: appointmentData.reason,
                customerName: appointmentData.customerName,
                customerEmail: appointmentData.customerEmail,
                customerPhone: appointmentData.customerPhone,
                notes: appointmentData.notes,
                status: 'scheduled'
            });

            await appointment.save();

            // Actualizar estadísticas del chatbot
            await Chatbot.updateOne(
                { _id: conversation.chatbotId },
                { $inc: { 'stats.totalAppointments': 1 } }
            );

            // Flag para detectar si falta Google Calendar
            let calendarWarning = false;

            // Enviar email de confirmación
            setImmediate(async () => {
                await emailService.sendAppointmentConfirmation({
                    customerName: appointmentData.customerName,
                    customerEmail: appointmentData.customerEmail,
                    scheduledAt: appointmentData.scheduledAt,
                    durationMinutes: appointmentData.durationMinutes || 30,
                    reason: appointmentData.reason
                });
            });

            // Crear evento en Google Calendar si está configurado
            if (chatbot?.integrations?.calendar?.accessToken) {
                setImmediate(async () => {
                    const result = await calendarService.createCalendarEvent(
                        conversation.chatbotId,
                        chatbot.integrations.calendar.accessToken,
                        {
                            customerName: appointmentData.customerName,
                            customerEmail: appointmentData.customerEmail,
                            scheduledAt: appointmentData.scheduledAt,
                            durationMinutes: appointmentData.durationMinutes || 30,
                            reason: appointmentData.reason
                        }
                    );

                    if (result.success) {
                        await Appointment.updateOne(
                            { _id: appointment._id },
                            {
                                calendarEventId: result.calendarEventId,
                                calendarEventUrl: result.calendarEventUrl
                            }
                        );
                    }
                });
            } else {
                calendarWarning = true;
            }

            const response = {
                success: true,
                message: 'Cita agendada exitosamente',
                data: { appointment }
            };

            // Agregar warning si Google Calendar no está conectado
            if (calendarWarning) {
                response.warning = 'APPOINTMENT_NOT_IN_CALENDAR';
                response.warningMessage = '⚠️ Tu cita ha sido registrada en nuestro sistema, pero no aparecerá en Google Calendar porque aún no está conectado.';
            }

            return response;
        } catch (error) {
            console.error('❌ EmbedService.requestAppointment:', error);
            return { success: false, message: error.message };
        }
    };

    getAvailability = async (chatbotId, workspaceId, days = 7) => {
        try {
            const chatbot = await Chatbot.findById(chatbotId);
            if (!chatbot) {
                return { success: false, message: 'Chatbot no encontrado' };
            }

            const startDate = new Date();
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + days);

            const slots = await appointmentService.getAvailableSlots(
                chatbotId,
                workspaceId,
                startDate,
                endDate,
                30 // 30 minutos por slot
            );

            return {
                success: true,
                message: 'Disponibilidad obtenida',
                data: { slots }
            };
        } catch (error) {
            console.error('❌ EmbedService.getAvailability:', error);
            return { success: false, message: error.message };
        }
    };

    searchProducts = async (chatbotId, query) => {
        try {
            // TODO: Search products_cache using embeddings (semantic search)
            return {
                success: true,
                message: 'Productos encontrados',
                data: { products: [] }
            };
        } catch (error) {
            console.error('❌ EmbedService.searchProducts:', error);
            return { success: false, message: error.message };
        }
    };

    /**
     * Detectar email y datos de cotización en mensaje
     * (Flujo humanizado: bot pide datos conversacionalmente, sistema los captura)
     */
    tryAutoGenerateQuote = async (conversationId, userMessage, botResponse) => {
        try {
            const conversation = await Conversation.findById(conversationId);
            if (!conversation) return null;

            const chatbot = await Chatbot.findById(conversation.chatbotId);
            if (!chatbot) return null;

            // 1. Verificar si hay contexto de cotización (cantidad + precio)
            const recentMessages = await Message.find({ conversationId })
                .sort({ createdAt: -1 })
                .limit(15)
                .lean();

            const conversationText = recentMessages.map(m => m.content).join(' ').toLowerCase();

            // Detectar cantidad mencionada
            const numberRegex = /(\d+)\s*(unidades?|unid|u|cantidad|botella|botellas|pack|packs|litro|litros|ml|kg|gramos)/gi;
            const quantityMatch = conversationText.match(numberRegex);

            // Detectar precio mencionado
            const botMessages = recentMessages.filter(m => m.role === 'assistant');
            const conversationWithBotMessages = botMessages.map(m => m.content).join(' ');
            const priceRegex = /\$?\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/g;
            const prices = conversationWithBotMessages.match(priceRegex);

            // Si no hay cantidad y precio, no hay intención de cotización
            if (!quantityMatch || !prices) {
                return null;
            }

            // 2. Extraer datos configurados (email, nombre, teléfono, etc.)
            const quoteFields = chatbot.quoteFields || [];
            const capturedData = {};
            let allRequiredFieldsPresent = true;

            // Patrones de extracción para campos comunes
            const patterns = {
                email: /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi,
                phone: /(\+?[\d\s\-\(\)]{8,})/g,
                name: null // Se extrae del contexto después
            };

            // Extraer datos según quoteFields
            for (const field of quoteFields.sort((a, b) => a.order - b.order)) {
                let value = null;

                if (field.fieldId === 'email' || field.label.toLowerCase().includes('email')) {
                    const emailMatches = conversationText.match(patterns.email);
                    value = emailMatches ? emailMatches[emailMatches.length - 1] : null;
                } else if (field.fieldId === 'phone' || field.label.toLowerCase().includes('teléfono') || field.label.toLowerCase().includes('telefono')) {
                    const phoneMatches = conversationText.match(patterns.phone);
                    value = phoneMatches ? phoneMatches[phoneMatches.length - 1] : null;
                } else if (field.fieldId === 'name' || field.label.toLowerCase().includes('nombre')) {
                    // Intentar extraer nombre (palabras capitalizadas o después de ciertos patrones)
                    const nameMatch = conversationText.match(/(?:soy|me llamo|mi nombre es)\s+([A-ZÁ][a-záéíóúü]+(?:\s+[A-ZÁ][a-záéíóúü]+)?)/i);
                    if (nameMatch) {
                        value = nameMatch[1];
                    }
                }

                capturedData[field.fieldId] = value;

                // Verificar si campo requerido falta
                if (field.required && !value) {
                    allRequiredFieldsPresent = false;
                }
            }

            // 3. Si faltan campos requeridos, no generar cotización aún
            // (el bot debe pedirlos conversacionalmente)
            if (!allRequiredFieldsPresent) {
                console.log(`⚠️ [AUTO-QUOTE] Faltan campos requeridos:`, {
                    capturedData,
                    missing: quoteFields
                        .filter(f => f.required && !capturedData[f.fieldId])
                        .map(f => f.label)
                });
                return null;
            }

            // 4. Todos los datos están presentes → generar cotización
            console.log(`✅ [AUTO-QUOTE] Todos los datos capturados:`, capturedData);

            const quantity = parseInt(quantityMatch[quantityMatch.length - 1]);
            const priceMatch = prices[prices.length - 1]?.replace(/\$|,/g, '');
            const unitPrice = parseInt(priceMatch);
            const total = unitPrice * quantity;

            const quoteResult = await this.requestQuote(conversationId, {
                items: [{
                    description: 'Productos solicitados',
                    quantity: quantity,
                    unitPrice: unitPrice,
                    total: total
                }],
                subtotal: total,
                tax: 0,
                total: total,
                currency: 'CLP',
                customerData: capturedData
            });

            if (quoteResult.success) {
                console.log(`✅ [AUTO-QUOTE] Cotización generada: ${quoteResult.data.quote.quoteNumber}`);
                return quoteResult.data.quote;
            }

            return null;
        } catch (error) {
            console.warn('⚠️ Auto-quote generation failed:', error.message);
            return null;
        }
    };

    // ── Controller-delegated methods ─────────────────────────────────────────

    getSlotsByDate = async ({ embedKey, date, guestCount }) => {
        try {
            const chatbot = await Chatbot.findOne({ embedKey });
            if (!chatbot) return { success: false, message: 'Chatbot no encontrado' };
            const { getAvailableSlotsForDate } = await import('../appointments/resource-availability.service.js');
            const slots = await getAvailableSlotsForDate(chatbot._id.toString(), date, parseInt(guestCount) || 1);
            return { success: true, data: { date, slots } };
        } catch (error) {
            return { success: false, message: error.message };
        }
    };

    getAvailableDates = async ({ embedKey, guestCount, daysAhead }) => {
        try {
            const chatbot = await Chatbot.findOne({ embedKey });
            if (!chatbot) return { success: false, message: 'Chatbot no encontrado' };
            const { getAvailableSlotsForDate } = await import('../appointments/resource-availability.service.js');
            const days = parseInt(daysAhead) || 14;
            const guests = parseInt(guestCount) || 1;
            const availableDates = [];
            for (let i = 0; i < days; i++) {
                const d = new Date();
                d.setUTCDate(d.getUTCDate() + i);
                const dateStr = d.toISOString().split('T')[0];
                const slots = await getAvailableSlotsForDate(chatbot._id.toString(), dateStr, guests);
                if (slots.length > 0) availableDates.push(dateStr);
            }
            return { success: true, data: { availableDates } };
        } catch (error) {
            return { success: false, message: error.message };
        }
    };

    getTableInfo = async (tableToken) => {
        try {
            const resource = await Resource.findOne({ tableToken, isActive: true });
            if (!resource) return { success: false, message: 'Mesa no encontrada' };
            const chatbot = await Chatbot.findById(resource.chatbotId).select('embedKey name widget');
            if (!chatbot) return { success: false, message: 'Chatbot no encontrado' };
            return { success: true, data: { tableId: resource._id, tableName: resource.name, embedKey: chatbot.embedKey, chatbotName: chatbot.name, widget: chatbot.widget } };
        } catch (error) {
            return { success: false, message: error.message };
        }
    };

    getQuoteFields = async (embedKey) => {
        try {
            const chatbot = await Chatbot.findOne({ embedKey }).select('quoteFields');
            if (!chatbot) return { success: false, message: 'Chatbot no encontrado' };
            return { success: true, data: chatbot.quoteFields || [] };
        } catch (error) {
            return { success: false, message: error.message };
        }
    };

    getBotInfo = async (embedKey) => {
        try {
            const chatbot = await Chatbot.findOne({ embedKey }).select('name widget businessType personality.welcomeMessage');
            if (!chatbot) return { success: false, message: 'Chatbot no encontrado' };

            // Sugerencias: usar las del bot si existen, sino fallback por businessType
            const DEFAULT_SUGGESTIONS = {
                restaurant: [
                    { icon: '🍽️', text: '¿Qué tienen en el menú hoy?' },
                    { icon: '📅', text: 'Quiero reservar una mesa' },
                    { icon: '🛵', text: 'Quiero hacer un pedido' },
                    { icon: '📍', text: '¿Dónde están y a qué hora abren?' },
                ],
                store: [
                    { icon: '🛍️', text: '¿Qué productos tienen disponibles?' },
                    { icon: '🚚', text: '¿Hacen despacho a domicilio?' },
                    { icon: '💳', text: '¿Cuáles son los métodos de pago?' },
                    { icon: '🔄', text: '¿Cuál es la política de devoluciones?' },
                ],
                clinic: [
                    { icon: '📅', text: 'Quiero agendar una consulta' },
                    { icon: '👨‍⚕️', text: '¿Qué especialidades tienen?' },
                    { icon: '💊', text: '¿Aceptan seguros de salud?' },
                    { icon: '📍', text: '¿Dónde están ubicados?' },
                ],
                generic: [
                    { icon: '💬', text: '¿En qué me pueden ayudar?' },
                    { icon: '📞', text: '¿Cómo los puedo contactar?' },
                    { icon: '🕐', text: '¿Cuál es el horario de atención?' },
                    { icon: '📍', text: '¿Dónde están ubicados?' },
                ],
            };

            const suggestions = (chatbot.widget?.suggestions?.length > 0)
                ? chatbot.widget.suggestions
                : (DEFAULT_SUGGESTIONS[chatbot.businessType] || DEFAULT_SUGGESTIONS.generic);

            return {
                success: true,
                data: {
                    name:           chatbot.name,
                    businessType:   chatbot.businessType || 'generic',
                    widget:         chatbot.widget || {},
                    welcomeMessage: chatbot.personality?.welcomeMessage || '',
                    suggestions,
                },
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    };

    /**
     * Genera un token efímero de la Realtime API de OpenAI para el widget de voz.
     * La API key real NUNCA sale del backend: el navegador solo recibe el client_secret
     * (vive ~1 min) y lo usa para abrir la conexión WebRTC directa con OpenAI.
     */
    mintRealtimeToken = async (embedKey) => {
        try {
            if (!embedKey) return { success: false, message: 'embedKey requerido' };

            const chatbot = await Chatbot.findOne({ embedKey });
            if (!chatbot) return { success: false, message: 'Chatbot no encontrado' };

            if (chatbot.voiceSettings?.enabled === false) {
                return { success: false, message: 'El widget de voz no está habilitado para este chatbot' };
            }

            const apiKey = chatbot.openaiApiKey; // getter desencripta
            if (!apiKey) {
                return { success: false, message: 'Este chatbot no tiene API key de OpenAI configurada' };
            }

            // Instrucciones = mismo cerebro que el chat de texto (empresa, tono, reglas, RAG-less base)
            let instructions = '';
            try {
                instructions = await chatbotConfigService.buildSystemPrompt(chatbot.workspaceId, chatbot._id);
            } catch (e) {
                logger.warn('mintRealtimeToken: no se pudo construir systemPrompt, usando fallback', { error: e.message });
                instructions = `Eres ${chatbot.name}, un asistente de voz amable y conciso. Responde en español de forma natural y breve.`;
            }

            const greeting = chatbot.voiceSettings?.greeting?.trim()
                || chatbot.personality?.welcomeMessage?.trim()
                || '';
            if (greeting) {
                instructions += `\n\nAl iniciar la conversación, saluda diciendo: "${greeting}"`;
            }
            // El audio no debe leer markdown ni listas largas: pedir respuestas conversacionales
            instructions += '\n\nIMPORTANTE: Estás en una llamada de voz. Habla de forma natural y conversacional, sin markdown, sin viñetas ni listas largas. Sé breve y claro.';

            // Tools: mismas que el chat de texto (reservar, pedir, cotizar) según el bot
            const tools = await buildToolsForChatbot(chatbot, null);
            const realtimeTools = toRealtimeTools(tools);
            if (realtimeTools.length) {
                instructions += '\n\nPuedes ejecutar acciones (reservar, tomar pedidos, generar cotizaciones) usando las herramientas disponibles. Antes de llamar una herramienta, confirma verbalmente con el cliente los datos clave (nombre, fecha/hora, productos, etc.). Nunca inventes datos: si falta algo, pregúntalo.';
            }

            const model = 'gpt-realtime';
            const voice = chatbot.voiceSettings?.voice || 'alloy';

            // Endpoint GA: /v1/realtime/client_secrets con objeto session anidado
            const sessionBody = {
                type: 'realtime',
                model,
                instructions,
                audio: {
                    output: { voice },
                    input: { transcription: { model: 'whisper-1' } },
                },
            };
            if (realtimeTools.length) {
                sessionBody.tools = realtimeTools;
                sessionBody.tool_choice = 'auto';
            }

            const resp = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ session: sessionBody }),
            });

            if (!resp.ok) {
                const errText = await resp.text().catch(() => '');
                logger.error('mintRealtimeToken: OpenAI rechazó la sesión', { status: resp.status, body: errText });
                let detail = errText;
                try { detail = JSON.parse(errText)?.error?.message || errText; } catch (_) {}
                return { success: false, message: `OpenAI ${resp.status}: ${detail || 'sesión rechazada'}` };
            }

            const session = await resp.json();
            // GA devuelve { value, expires_at, session }; beta devolvía { client_secret: { value } }
            const clientSecret = session?.value || session?.client_secret?.value;
            if (!clientSecret) {
                return { success: false, message: 'OpenAI no devolvió un token efímero válido' };
            }

            return {
                success: true,
                data: {
                    token: clientSecret,
                    expiresAt: session?.expires_at || session?.client_secret?.expires_at || null,
                    model,
                    voice,
                    botName: chatbot.name,
                    greeting,
                },
            };
        } catch (error) {
            logger.error('mintRealtimeToken error', { error: error.message });
            return { success: false, message: error.message };
        }
    };

    /**
     * Registra una línea de transcripción de voz como Message (para que la
     * conversación de voz aparezca igual que una de chat en el panel).
     */
    logVoiceMessage = async (conversationId, role, content) => {
        try {
            if (!conversationId || !content) return { success: false };
            const conversation = await Conversation.findById(conversationId);
            if (!conversation) return { success: false, message: 'Conversación no encontrada' };
            await Message.create({
                conversationId: conversation._id,
                chatbotId: conversation.chatbotId,
                role: role === 'user' ? 'user' : 'assistant',
                content: String(content).slice(0, 4000),
                createdAt: new Date(),
            });
            await Conversation.updateOne({ _id: conversation._id }, {
                $set: { lastMessageAt: new Date() },
                $inc: { messageCount: 1 },
            });
            return { success: true };
        } catch (error) {
            logger.error('logVoiceMessage error', { error: error.message });
            return { success: false, message: error.message };
        }
    };

    /**
     * Ejecuta una tool solicitada por el modelo de voz (Realtime API).
     * El modelo ya recopiló y confirmó los datos conversacionalmente, así que
     * aquí ejecutamos la acción real (crear cita/pedido/cotización) reusando
     * los mismos servicios que el chat de texto, y devolvemos un texto hablable.
     */
    executeVoiceTool = async (embedKey, conversationId, name, args) => {
        try {
            const chatbot = await Chatbot.findOne({ embedKey });
            if (!chatbot) return { success: false, message: 'Chatbot no encontrado' };
            const conversation = conversationId ? await Conversation.findById(conversationId) : null;
            if (!conversation) return { success: false, message: 'Conversación no encontrada' };

            args = args || {};
            const tableInfo = conversation.visitorMetadata || {};
            const isDineInOrder = !!(tableInfo.tableId);

            // ── book_appointment ──
            if (name === 'book_appointment') {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date || '') || !/^\d{2}:\d{2}$/.test(args.time || '')) {
                    return { success: true, result: 'Necesito la fecha y la hora exactas para reservar. ¿Para cuándo te gustaría?' };
                }
                const best = await findBestResource(
                    chatbot._id.toString(), args.date, args.time, args.guest_count || 1, args.preferred_resource || null
                );
                if (!best) {
                    return { success: true, result: 'Ese horario ya no está disponible. ¿Te acomoda otro horario?' };
                }
                const scheduledAt = new Date(`${args.date}T${args.time}:00.000Z`);
                const fields = chatbot.appointmentFields || [];
                const resolved = {};
                for (const f of fields) resolved[f.fieldId] = args[f.fieldId] || args[`customer_${f.fieldId}`] || '';
                const extraNotes = fields.filter(f => resolved[f.fieldId]).map(f => `${f.label}: ${resolved[f.fieldId]}`).join(' | ');

                // Evitar duplicados en la misma conversación
                const existing = await Appointment.findOne({ conversationId: conversation._id, status: { $ne: 'cancelled' } });
                if (existing) {
                    return { success: true, result: `Tu reserva ya está confirmada para el ${args.date} a las ${args.time}. ¿Algo más en que te ayude?` };
                }
                await Appointment.create({
                    chatbotId: chatbot._id, workspaceId: chatbot.workspaceId, conversationId: conversation._id,
                    resourceId: best.id, guestCount: args.guest_count || 1, scheduledAt,
                    durationMinutes: best.durationMinutes || 90,
                    customerName: resolved['name'] || '', customerEmail: resolved['email'] || '', customerPhone: resolved['phone'] || '',
                    notes: extraNotes || args.notes || '', status: 'scheduled',
                });
                await Chatbot.updateOne({ _id: chatbot._id }, { $inc: { 'stats.totalAppointments': 1 } });
                return { success: true, result: `Reserva confirmada para ${args.guest_count || 1} persona(s) el ${args.date} a las ${args.time}. Avísale al cliente que recibirá una confirmación.` };
            }

            // ── create_order ──
            if (name === 'create_order') {
                const delivery = chatbot.deliveryConfig || {};
                if (!Array.isArray(args.items) || args.items.length === 0) {
                    return { success: true, result: 'No tengo productos en el pedido. ¿Qué desea pedir el cliente?' };
                }
                const items = args.items.map(i => ({
                    name: i.name, quantity: i.quantity, unitPrice: i.unit_price, totalPrice: (i.unit_price || 0) * (i.quantity || 0),
                    notes: i.notes || '', variant: i.variant || '', productId: i.product_id || null,
                }));
                if (chatbot.businessType === 'store') {
                    const stockCheck = await stockService.checkOrderStock(items);
                    if (!stockCheck.valid) {
                        const issues = stockCheck.issues.map(iss => iss.message).join('; ');
                        return { success: true, result: `Hay un problema de stock: ${issues}. Pregúntale al cliente si quiere ajustar cantidades.` };
                    }
                }
                const subtotal = items.reduce((s, i) => s + i.totalPrice, 0);
                const deliveryCost = isDineInOrder ? 0 : (delivery.deliveryCost || 0);
                const total = subtotal + deliveryCost;
                const order = await Order.create({
                    chatbotId: chatbot._id, workspaceId: chatbot.workspaceId, conversationId: conversation._id,
                    orderType: isDineInOrder ? 'dine_in' : (args.delivery_address === 'retiro' ? 'pickup' : 'delivery'),
                    tableId: tableInfo.tableId || null, tableName: tableInfo.tableName || null,
                    items, subtotal, deliveryCost, total,
                    customerName: args.customer_name || (isDineInOrder ? 'Cliente en mesa' : ''),
                    customerPhone: args.customer_phone || '', customerEmail: args.customer_email || '',
                    deliveryAddress: isDineInOrder ? `Mesa: ${tableInfo.tableName}` : (args.delivery_address || ''),
                    deliveryZone: args.delivery_zone || '', estimatedMinutes: delivery.estimatedMinutes || 20,
                    notes: args.notes || '', status: 'new',
                });
                if (chatbot.businessType === 'store') setImmediate(() => stockService.decrementOrderStock(items));
                const itemsText = items.map(i => `${i.quantity} ${i.name}${i.variant ? ` (${i.variant})` : ''}`).join(', ');
                return { success: true, result: `Pedido #${order.orderNumber} registrado: ${itemsText}. Total ${total.toLocaleString()}. Confírmaselo al cliente.` };
            }

            // ── generate_quote ──
            if (name === 'generate_quote') {
                const qConfig = chatbot.quoteConfig || {};
                if (!Array.isArray(args.items) || args.items.length === 0) {
                    return { success: true, result: 'Necesito los productos para cotizar. ¿Qué necesita el cliente?' };
                }
                const items = args.items.map(i => {
                    let discountPct = 0;
                    if (qConfig.volumeDiscounts?.length) {
                        const tier = [...qConfig.volumeDiscounts].sort((a, b) => b.minQty - a.minQty).find(d => i.quantity >= d.minQty);
                        if (tier) discountPct = tier.discountPct;
                    }
                    const discountedPrice = (i.unit_price || 0) * (1 - discountPct / 100);
                    return {
                        description: `${i.name}${i.variant ? ` [${i.variant}]` : ''}`, quantity: i.quantity,
                        unitPrice: parseFloat(discountedPrice.toFixed(2)), total: parseFloat((discountedPrice * i.quantity).toFixed(2)),
                        discount: discountPct > 0 ? `${discountPct}% desc.` : null,
                    };
                });
                const subtotal = items.reduce((s, i) => s + i.total, 0);
                const taxAmt = qConfig.taxRate ? subtotal * (qConfig.taxRate / 100) : 0;
                const total = subtotal + taxAmt;
                const quote = await Quote.create({
                    chatbotId: chatbot._id, workspaceId: chatbot.workspaceId, conversationId: conversation._id,
                    quoteNumber: `QT-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
                    items, subtotal: parseFloat(subtotal.toFixed(2)), tax: parseFloat(taxAmt.toFixed(2)), total: parseFloat(total.toFixed(2)),
                    currency: 'CLP', customerData: { name: args.customer_name, email: args.customer_email, phone: args.customer_phone || '' },
                    shareToken: crypto.randomBytes(16).toString('hex'),
                    expiresAt: new Date(Date.now() + (qConfig.validityDays || 30) * 86400000), status: 'draft',
                });
                return { success: true, result: `Cotización ${quote.quoteNumber} generada por un total de ${total.toLocaleString()}. Se enviará a ${args.customer_email}. Confírmaselo al cliente.` };
            }

            // ── request_bill ──
            if (name === 'request_bill') {
                const tableOrders = await Order.find({ conversationId: conversation._id, orderType: 'dine_in', status: { $nin: ['cancelled'] } });
                await Order.updateMany(
                    { conversationId: conversation._id, orderType: 'dine_in', billRequested: false },
                    { billRequested: true, billRequestedAt: new Date() }
                );
                const grandTotal = tableOrders.reduce((s, o) => s + (o.total || 0), 0);
                return { success: true, result: `Cuenta solicitada. Total de la mesa: ${grandTotal.toLocaleString()}. Avísale al cliente que el equipo le llevará la cuenta.` };
            }

            return { success: false, message: `Tool desconocida: ${name}` };
        } catch (error) {
            logger.error('executeVoiceTool error', { tool: name, error: error.message });
            return { success: false, message: error.message, result: 'Hubo un problema al procesar la solicitud. Intenta de nuevo.' };
        }
    };

    getEmbedCode = async (botId) => {
        try {
            const chatbot = await Chatbot.findById(botId).select('_id name widget embedKey');
            if (!chatbot) return { success: false, message: 'Chatbot no encontrado' };
            const apiUrl = process.env.API_URL || 'http://localhost:5001';
            const embedCode = `<!-- Bezpian Chat Widget -->\n<script src="${apiUrl}/widget.js" data-embed-key="${chatbot.embedKey}" async></script>\n<!-- End Bezpian Chat Widget -->`;
            return { success: true, data: { chatbotId: botId, chatbotName: chatbot.name, embedCode } };
        } catch (error) {
            return { success: false, message: error.message };
        }
    };

}
