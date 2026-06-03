import EmbedService from '../../services/embed/embed.service.js';

const embedService = new EmbedService();

export default class EmbedController {
    startConversation = async (req, res) => {
        try {
            const { embedKey, visitorId, tableId } = req.body;
            const response = await embedService.startConversation(embedKey, visitorId, {}, tableId || null);
            return res.status(response.success ? 201 : 400).json(response);
        } catch (error) {
            console.error('❌ EmbedController.startConversation:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al iniciar conversación'
            });
        }
    };

    sendMessage = async (req, res) => {
        try {
            const { conversationId, content, botId } = req.body;

            if (!conversationId || !content || !botId) {
                return res.status(400).json({
                    success: false,
                    message: 'conversationId, content y botId son requeridos'
                });
            }

            const response = await embedService.sendMessage(conversationId, content, botId);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ EmbedController.sendMessage:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al enviar mensaje'
            });
        }
    };

    captureLead = async (req, res) => {
        try {
            const { conversationId, ...leadData } = req.body;
            const response = await embedService.captureLead(conversationId, leadData);
            return res.status(response.success ? 201 : 400).json(response);
        } catch (error) {
            console.error('❌ EmbedController.captureLead:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al capturar lead'
            });
        }
    };

    requestQuote = async (req, res) => {
        try {
            const { conversationId, ...quoteData } = req.body;
            const response = await embedService.requestQuote(conversationId, quoteData);
            return res.status(response.success ? 201 : 400).json(response);
        } catch (error) {
            console.error('❌ EmbedController.requestQuote:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al solicitar cotización'
            });
        }
    };

    requestAppointment = async (req, res) => {
        try {
            const { conversationId, ...appointmentData } = req.body;
            const response = await embedService.requestAppointment(conversationId, appointmentData);
            return res.status(response.success ? 201 : 400).json(response);
        } catch (error) {
            console.error('❌ EmbedController.requestAppointment:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al agendar'
            });
        }
    };

    getAvailability = async (req, res) => {
        try {
            const { embedKey, date, guestCount } = req.query;

            const Chatbot = (await import('../../models/Chatbot.js')).default;
            const chatbot = await Chatbot.findOne({ embedKey });

            if (!chatbot) {
                return res.status(404).json({ success: false, message: 'Chatbot no encontrado' });
            }

            // New resource-based availability
            const { getAvailableSlotsForDate } = await import('../../services/appointments/resourceAvailability.service.js');
            const slots = await getAvailableSlotsForDate(
                chatbot._id.toString(),
                date,
                parseInt(guestCount) || 1
            );

            return res.status(200).json({ success: true, data: { date, slots } });
        } catch (error) {
            console.error('❌ EmbedController.getAvailability:', error);
            return res.status(500).json({ success: false, message: 'Error al obtener disponibilidad' });
        }
    };

    getTableInfo = async (req, res) => {
        try {
            const { tableToken } = req.params;
            const Resource = (await import('../../models/Resource.js')).default;
            const Chatbot  = (await import('../../models/Chatbot.js')).default;
            const resource = await Resource.findOne({ tableToken, isActive: true });
            if (!resource) return res.status(404).json({ success: false, message: 'Mesa no encontrada' });
            const chatbot = await Chatbot.findById(resource.chatbotId).select('embedKey name widget');
            if (!chatbot) return res.status(404).json({ success: false, message: 'Chatbot no encontrado' });
            return res.json({
                success: true,
                data: {
                    tableId: resource._id,
                    tableName: resource.name,
                    embedKey: chatbot.embedKey,
                    chatbotName: chatbot.name,
                    widget: chatbot.widget,
                }
            });
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    };

    getAvailableDates = async (req, res) => {
        try {
            const { embedKey, guestCount, daysAhead } = req.query;

            const Chatbot = (await import('../../models/Chatbot.js')).default;
            const chatbot = await Chatbot.findOne({ embedKey });
            if (!chatbot) return res.status(404).json({ success: false, message: 'Chatbot no encontrado' });

            const { getAvailableSlotsForDate } = await import('../../services/appointments/resourceAvailability.service.js');
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

            return res.status(200).json({ success: true, data: { availableDates } });
        } catch (error) {
            console.error('❌ EmbedController.getAvailableDates:', error);
            return res.status(500).json({ success: false, message: 'Error al obtener fechas disponibles' });
        }
    };

    searchProducts = async (req, res) => {
        try {
            const { embedKey, q } = req.query;
            const response = await embedService.searchProducts(embedKey, q);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ EmbedController.searchProducts:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al buscar productos'
            });
        }
    };

    getQuoteFields = async (req, res) => {
        try {
            const { embedKey } = req.query;

            const Chatbot = (await import('../../models/Chatbot.js')).default;
            const chatbot = await Chatbot.findOne({ embedKey }).select('quoteFields');

            if (!chatbot) {
                return res.status(404).json({
                    success: false,
                    message: 'Chatbot no encontrado'
                });
            }

            const fields = chatbot.quoteFields || [];
            return res.status(200).json({
                success: true,
                data: fields
            });
        } catch (error) {
            console.error('❌ EmbedController.getQuoteFields:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al obtener campos de cotización'
            });
        }
    };

    getEmbedCode = async (req, res) => {
        try {
            const { botId } = req.params;

            const Chatbot = (await import('../../models/Chatbot.js')).default;
            const chatbot = await Chatbot.findById(botId).select('_id name widget embedKey');

            if (!chatbot) {
                return res.status(404).json({
                    success: false,
                    message: 'Chatbot no encontrado'
                });
            }

            const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            const apiUrl = process.env.API_URL || 'http://localhost:5001';

                        // Read widget settings from chatbot (if available)
                        const widget = (chatbot.widget) ? chatbot.widget : {};
                        const color = widget.color || '#667eea';
                        const avatar = widget.avatar || '🤖';
                        const embedKey = chatbot.embedKey || '';

                        const embedCode = `<!-- Zapien Chat Widget -->
<div id="zapien-chat-${botId}"></div>
<script>
    (function() {
        const chatbotId = '${botId}';
        const embedKey = '';
        const apiUrl = '${apiUrl}';
        const baseUrl = '${baseUrl}';
        const chatConfig = {
            color: '${color}',
            avatar: '${avatar}',
            chatbotName: '${chatbot.name}'
        };

        // Crear iframe (inicialmente minimizado)
        const iframe = document.createElement('iframe');
        iframe.src = baseUrl + '/embed.html?botId=' + chatbotId + '&color=' + encodeURIComponent(chatConfig.color) + '&avatar=' + encodeURIComponent(chatConfig.avatar) + '&name=' + encodeURIComponent(chatConfig.chatbotName);
        iframe.style.cssText = 'position:fixed;bottom:20px;right:20px;width:64px;height:64px;border:none;border-radius:999px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.16);z-index:99999;transition:width 240ms ease,height 240ms ease,border-radius 240ms ease;';
        iframe.id = 'zapien-chat-iframe-${botId}';
        iframe.allow = 'geolocation; microphone; camera';

        document.body.appendChild(iframe);

        // Comunicación entre ventanas: handshake y open/close control
        window.addEventListener('message', function(event) {
            if (event.origin !== baseUrl) return;

            if (event.data.type === 'zapien-chat-ready') {
                iframe.contentWindow.postMessage({
                    type: 'zapien-init',
                    chatbotId: chatbotId,
                    embedKey: embedKey,
                    apiUrl: apiUrl,
                    color: chatConfig.color,
                    avatar: chatConfig.avatar,
                    chatbotName: chatConfig.chatbotName
                }, '*');
            }

            if (event.data.type === 'zapien-open-request') {
                iframe.style.width = '400px';
                iframe.style.height = '500px';
                iframe.style.borderRadius = '12px';
            }

            if (event.data.type === 'zapien-close-request') {
                iframe.style.width = '64px';
                iframe.style.height = '64px';
                iframe.style.borderRadius = '999px';
                iframe.contentWindow.postMessage({ type: 'zapien-close' }, '*');
            }
        });
    })();
</script>
<!-- End Zapien Chat Widget -->`;

            return res.status(200).json({
                success: true,
                data: {
                    chatbotId: botId,
                    chatbotName: chatbot.name,
                    embedCode: embedCode,
                    apiUrl,
                    baseUrl
                }
            });
        } catch (error) {
            console.error('❌ EmbedController.getEmbedCode:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al generar código embed'
            });
        }
    };
}
