import Chatbot from '../../models/Chatbot.js';
import Conversation from '../../models/Conversation.js';
import Message from '../../models/Message.js';
import Appointment from '../../models/Appointment.js';
import Lead from '../../models/Lead.js';
import Quote from '../../models/Quote.js';
import CompanyInfo from '../../models/CompanyInfo.js';
import openaiService from '../openai/openai.service.js';
import AdvancedRAGService from '../rag/advanced-rag.service.js';
import chatbotConfigService from '../config/chatbot-config.service.js';
import appointmentService from '../appointments/appointment.service.js';
import socialService from '../messaging/social.service.js';
import whatsappService from '../messaging/whatsapp.service.js';
import emailService from '../notifications/email.service.js';
import calendarService from '../calendar/calendar.service.js';
import logger from '../../utils/logger.js';

const whatsAppInstance = new whatsappService();
const advancedRag = new AdvancedRAGService();

function buildAppointmentTool(chatbot) {
    const customFields = chatbot.appointmentFields?.length ? chatbot.appointmentFields : [
        { fieldId: 'name', label: 'Nombre', required: true },
        { fieldId: 'phone', label: 'Teléfono', required: true },
    ];

    const properties = {
        date: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
        time: { type: 'string', description: 'Hora en formato HH:MM (24h)' },
        guest_count: { type: 'integer', description: 'Número de personas' },
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
            description: 'Crea una reserva cuando tienes TODOS los datos obligatorios confirmados por el usuario.',
            parameters: { type: 'object', properties, required },
        },
    };
}

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
    const delivery = chatbot.deliveryConfig || {};
    return {
        type: 'function',
        function: {
            name: 'create_order',
            description: `Crea un pedido de delivery cuando el cliente ha confirmado todos los productos, su dirección de entrega y sus datos de contacto. Llama esta función SOLO cuando tengas: al menos un producto con cantidad, nombre del cliente, teléfono y dirección.`,
            parameters: {
                type: 'object',
                properties: {
                    customer_name:     { type: 'string', description: 'Nombre completo del cliente' },
                    customer_phone:    { type: 'string', description: 'Teléfono del cliente' },
                    customer_email:    { type: 'string', description: 'Email del cliente (opcional)' },
                    delivery_address:  { type: 'string', description: 'Dirección completa de entrega' },
                    delivery_zone:     { type: 'string', description: 'Zona o barrio de entrega' },
                    notes:             { type: 'string', description: 'Notas adicionales del pedido (opcional)' },
                    items: {
                        type: 'array',
                        description: 'Lista de productos pedidos',
                        items: {
                            type: 'object',
                            properties: {
                                name:       { type: 'string', description: 'Nombre del producto' },
                                quantity:   { type: 'integer', description: 'Cantidad' },
                                unit_price: { type: 'number', description: 'Precio unitario' },
                            },
                            required: ['name', 'quantity', 'unit_price'],
                        },
                    },
                },
                required: ['customer_name', 'customer_phone', 'delivery_address', 'items'],
            },
        },
    };
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
            const { Workspace } = await import('../../models/index.js');
            const workspace = await Workspace.findById(chatbot.workspaceId).select('plan');
            const CONV_LIMITS = { free: 500, starter: 1000, pro: 5000, enterprise: -1 };
            const limit = CONV_LIMITS[workspace?.plan || 'free'];
            if (limit > 0) {
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
                const Resource = (await import('../../models/Resource.js')).default;
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

            const Resource = (await import('../../models/Resource.js')).default;
            const hasResources = await Resource.exists({ chatbotId: chatbot._id, isActive: true });
            const isDineIn = !!tableId;
            const dineInWelcome = isDineIn && tableName
                ? `¡Bienvenido a La Rufina! 👋 Estás en **${tableName}**. Puedo tomar tu pedido, mostrarte el menú o pedir la cuenta cuando estés listo. ¿Qué deseas?`
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

    sendMessage = async (conversationId, content, botId) => {
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
            const cachedResponse = advancedRag.getCachedResponse(botId, content);
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

            // 3.5. Procesar automáticamente para detectar y guardar leads
            const LeadServiceClass = (await import('./../../services/leads/lead.service.js')).default;
            const leadService = new LeadServiceClass();
            const leadProcessResult = await leadService.processMessageForLead(
                conversationId,
                content,
                chatbot._id,
                chatbot.workspaceId
            );
            if (leadProcessResult.leadDetected) {
                logger.info('✅ Lead detectado y guardado automáticamente', {
                    conversationId,
                    leadId: leadProcessResult.leadId,
                    leadInfo: leadProcessResult.leadInfo
                });
            }

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

            // 11. Llamar OpenAI (con function calling si agendamiento activo)
            const openaiStartTime = Date.now();
            const calEnabled = chatbot.integrations?.calendar?.enabled;
            const Resource = (await import('../../models/Resource.js')).default;
            const activeResources = calEnabled ? await Resource.find({ chatbotId: chatbot._id, isActive: true }) : [];
            const appointmentTools = activeResources.length > 0 ? [buildAppointmentTool(chatbot)] : [];
            const isDineIn = !!(conversation.visitorMetadata?.tableId);
            const deliveryTools = (chatbot.deliveryConfig?.enabled || isDineIn) ? [buildOrderTool(chatbot)] : [];
            const billTools = isDineIn ? [REQUEST_BILL_TOOL] : [];
            const allTools = [...appointmentTools, ...deliveryTools, ...billTools];

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
                    const { findBestResource } = await import('../appointments/resourceAvailability.service.js');
                    const best = await findBestResource(
                        chatbot._id.toString(),
                        args.date,
                        args.time,
                        args.guest_count || 1
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
                        const Appointment = (await import('../../models/Appointment.js')).default;
                        // Map custom fields to standard appointment fields
                        const fields = chatbot.appointmentFields?.length ? chatbot.appointmentFields : [
                            { fieldId: 'name' }, { fieldId: 'phone' },
                        ];
                        const getName = () => fields.find(f => f.fieldId === 'name') ? args['name'] : args['customer_name'];
                        const getPhone = () => fields.find(f => f.fieldId === 'phone') ? args['phone'] : args['customer_phone'];
                        const getEmail = () => fields.find(f => f.fieldId === 'email') ? args['email'] : args['customer_email'];
                        const extraNotes = fields.filter(f => !['name','phone','email'].includes(f.fieldId) && args[f.fieldId])
                            .map(f => `${f.label}: ${args[f.fieldId]}`).join(' | ');

                        appointmentCreated = await Appointment.create({
                            chatbotId: chatbot._id,
                            workspaceId: chatbot.workspaceId,
                            conversationId: conversation._id,
                            resourceId: best.id,
                            guestCount: args.guest_count || 1,
                            scheduledAt,
                            durationMinutes: best.durationMinutes || 90,
                            customerName: getName() || args.customer_name || '',
                            customerEmail: getEmail() || '',
                            customerPhone: getPhone() || '',
                            notes: extraNotes || args.notes || '',
                            status: 'scheduled',
                        });
                        await Chatbot.updateOne({ _id: chatbot._id }, { $inc: { 'stats.totalAppointments': 1 } });
                        // Build confirmation message
                        const confirmedDateStr = scheduledAt.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
                        response.content = `✅ ¡Reserva confirmada, ${args.customer_name}! Te esperamos el **${confirmedDateStr} a las ${args.time}** (${args.guest_count || 1} ${args.guest_count === 1 ? 'persona' : 'personas'}). Recibirás una confirmación. ¿Hay algo más en lo que pueda ayudarte?`;
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

                    const items = args.items.map(i => ({
                        name:       i.name,
                        quantity:   i.quantity,
                        unitPrice:  i.unit_price,
                        totalPrice: i.unit_price * i.quantity,
                        notes:      i.notes || '',
                    }));
                    const subtotal = items.reduce((s, i) => s + i.totalPrice, 0);
                    const deliveryCost = isDineInOrder ? 0 : (delivery.deliveryCost || 0);
                    const total = subtotal + deliveryCost;

                    const OrderModel = (await import('../../models/Order.js')).default;
                    const order = await OrderModel.create({
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

                    const itemsText = items.map(i => `${i.quantity}× ${i.name}${i.notes ? ` (${i.notes})` : ''}`).join(', ');
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

            // Handle request_bill tool call
            if (response.toolCall?.function?.name === 'request_bill') {
                try {
                    const args = JSON.parse(response.toolCall.function.arguments || '{}');
                    const tableInfo = conversation.visitorMetadata || {};
                    const OrderModel = (await import('../../models/Order.js')).default;

                    // Find all orders for this table in this conversation
                    const tableOrders = await OrderModel.find({
                        conversationId: conversation._id,
                        orderType: 'dine_in',
                        status: { $nin: ['cancelled'] },
                    });

                    // Mark bill as requested
                    await OrderModel.updateMany(
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
            advancedRag.cacheResponse(botId, content, response.content);
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
            const { findBestResource } = await import('../appointments/resourceAvailability.service.js');
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
}
