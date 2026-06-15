import crypto from 'crypto';
import { Chatbot, Conversation, Message, Lead, Appointment, Quote } from '../../models/index.js';
import CompanyInfo from '../../models/CompanyInfo.js';

export default class ChatbotService {
    list = async (workspaceId) => {
        try {
            const chatbots = await Chatbot.find({ workspaceId });
            return { success: true, message: 'Chatbots obtenidos', data: chatbots };
        } catch (error) {
            console.error('❌ ChatbotService.list:', error);
            return { success: false, message: error.message };
        }
    };

    create = async (workspaceId, chatbotData) => {
        try {
            console.log('🔵 ChatbotService.create called with:', {
                botName: chatbotData.botName,
                hasOpenaiApiKey: !!chatbotData.openaiApiKey,
                openaiApiKey: chatbotData.openaiApiKey ? '***' : 'NOT PROVIDED',
                openaiModel: chatbotData.openaiModel,
                openaiSettings: chatbotData.openaiSettings
            });

            const embedKey = crypto.randomBytes(16).toString('hex');

            const chatbot = new Chatbot({
                workspaceId,
                name: chatbotData.botName,
                embedKey,
                status: 'draft',
                personality: {
                    tone: chatbotData.tone || 'neutral',
                    welcomeMessage: chatbotData.welcomeMessage || `Hola, soy ${chatbotData.botName}. ¿Cómo puedo ayudarte?`,
                    fallbackMessage: chatbotData.fallbackMessage || 'No estoy seguro de eso. ¿Quieres que te conecte con alguien del equipo?',
                    customPrompt: chatbotData.botDescription || ''
                },
                widget: {
                    color: chatbotData.primaryColor || '#DCFF1E',
                    position: chatbotData.position || 'bottom-right',
                    avatar: chatbotData.avatar || '🤖',
                    proactiveMessage: chatbotData.proactiveMessage
                },
                features: {
                    chat: chatbotData.features?.chat ?? true,
                    quotes: chatbotData.features?.quotations ?? false,
                    appointments: chatbotData.features?.scheduling ?? false,
                    leadCapture: chatbotData.features?.leadCapture ?? false
                },
                integrations: {
                    productsApi: chatbotData.apiUrl ? {
                        url: chatbotData.apiUrl,
                        headers: chatbotData.apiKey ? { 'Authorization': `Bearer ${chatbotData.apiKey}` } : {}
                    } : undefined
                },
                openaiApiKey: chatbotData.openaiApiKey || undefined,
                openaiModel: chatbotData.openaiModel || 'gpt-3.5-turbo',
                openaiSettings: chatbotData.openaiSettings || {
                    temperature: 0.7,
                    maxTokens: 500,
                    topP: 1
                }
            });

            await chatbot.save();

            // Automatically create an empty CompanyInfo for this chatbot
            // Each chatbot has its own isolated company info — no sharing between bots
            await CompanyInfo.create({
                workspaceId,
                chatbotId: chatbot._id,
                company: { name: chatbotData.botName },
            });

            console.log('✅ Chatbot saved with:', {
                id: chatbot._id,
                name: chatbot.name,
                hasOpenaiApiKey: !!chatbot.openaiApiKey,
                openaiModel: chatbot.openaiModel,
                openaiSettings: chatbot.openaiSettings
            });

            return { success: true, message: 'Chatbot creado', data: chatbot };
        } catch (error) {
            console.error('❌ ChatbotService.create:', error);
            return { success: false, message: error.message };
        }
    };

    get = async (chatbotId) => {
        try {
            const chatbot = await Chatbot.findById(chatbotId);
            if (!chatbot) return { success: false, message: 'Chatbot no encontrado' };
            return { success: true, message: 'Chatbot obtenido', data: chatbot };
        } catch (error) {
            console.error('❌ ChatbotService.get:', error);
            return { success: false, message: error.message };
        }
    };

    update = async (chatbotId, updates) => {
        try {
            // Usar findByIdAndUpdate con opciones correctas para subdocumentos
            const chatbot = await Chatbot.findByIdAndUpdate(
                chatbotId,
                updates,
                {
                    new: true,
                    runValidators: true,
                    overwrite: false
                }
            );
            return { success: true, message: 'Chatbot actualizado', data: chatbot };
        } catch (error) {
            console.error('❌ ChatbotService.update:', error);
            return { success: false, message: error.message };
        }
    };

    delete = async (chatbotId) => {
        try {
            await Chatbot.deleteOne({ _id: chatbotId });
            await Conversation.deleteMany({ chatbotId });
            await Message.deleteMany({ chatbotId });
            await Lead.deleteMany({ chatbotId });
            return { success: true, message: 'Chatbot eliminado' };
        } catch (error) {
            console.error('❌ ChatbotService.delete:', error);
            return { success: false, message: error.message };
        }
    };

    activate = async (chatbotId) => {
        try {
            await Chatbot.updateOne({ _id: chatbotId }, { status: 'active' });
            return { success: true, message: 'Chatbot activado' };
        } catch (error) {
            console.error('❌ ChatbotService.activate:', error);
            return { success: false, message: error.message };
        }
    };

    pause = async (chatbotId) => {
        try {
            await Chatbot.updateOne({ _id: chatbotId }, { status: 'paused' });
            return { success: true, message: 'Chatbot pausado' };
        } catch (error) {
            console.error('❌ ChatbotService.pause:', error);
            return { success: false, message: error.message };
        }
    };

    getEmbedCode = async (chatbotId) => {
        try {
            const chatbot = await Chatbot.findById(chatbotId);
            if (!chatbot) return { success: false, message: 'Chatbot no encontrado' };

            const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            const apiUrl = process.env.API_URL || 'http://localhost:5001';

            // Widget configuration
            const widget = chatbot.widget || {};
            const color = widget.color || '#667eea';
            const avatar = widget.avatar || '🤖';
            const position = widget.position || 'bottom-right';

            const embedCode = `<!-- Pielo Chat Widget -->
<div id="zapien-chat-${chatbotId}"></div>
<script>
  // Configura el contexto del usuario aquí (opcional)
  // El bot usará esta información para personalizar sus respuestas.
  window.PieloUser = {
    isLoggedIn: false,       // true / false
    // name:    '',          // nombre del usuario
    // email:   '',          // email del usuario
    // role:    '',          // rol o plan (ej: 'premium', 'free', 'admin')
    // custom:  {}           // cualquier dato adicional
  };
</script>
<script>
  (function() {
    const chatbotId = '${chatbotId}';
    const embedKey = '${chatbot.embedKey}';
    const apiUrl = '${apiUrl}';
    const baseUrl = '${baseUrl}';
    const chatConfig = {
      color: '${color}',
      avatar: '${avatar}',
      chatbotName: '${chatbot.name}'
    };

        // Crear iframe (inicialmente minimizado: círculo pequeño)
        const iframe = document.createElement('iframe');
        iframe.src = baseUrl + '/embed.html?botId=' + chatbotId + '&embedKey=' + embedKey + '&color=' + encodeURIComponent(chatConfig.color) + '&avatar=' + encodeURIComponent(chatConfig.avatar) + '&name=' + encodeURIComponent(chatConfig.chatbotName);
        // Minimized style: small circular button; when opened we expand it programmatically
        iframe.style.cssText = 'position:fixed;bottom:20px;right:20px;width:64px;height:64px;border:none;border-radius:999px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.16);z-index:99999;transition:width 240ms ease,height 240ms ease,border-radius 240ms ease;';
        iframe.id = 'zapien-chat-iframe-${chatbotId}';
        iframe.allow = 'geolocation; microphone; camera';

        document.body.appendChild(iframe);

        // Comunicación entre ventanas: handshake y open/close control
        window.addEventListener('message', function(event) {
            if (event.origin !== baseUrl) return;

            // Iframe reports ready — pass user context
            if (event.data.type === 'zapien-chat-ready') {
                iframe.contentWindow.postMessage({
                    type: 'zapien-init',
                    chatbotId: chatbotId,
                    embedKey: embedKey,
                    apiUrl: apiUrl,
                    color: chatConfig.color,
                    avatar: chatConfig.avatar,
                    chatbotName: chatConfig.chatbotName,
                    visitorContext: window.PieloUser || {}
                }, '*');
            }

            // Iframe requests to open (user clicked minimized button)
            if (event.data.type === 'zapien-open-request') {
                // Expand iframe to full size (responsive fallback)
                iframe.style.width = '400px';
                iframe.style.height = '500px';
                iframe.style.borderRadius = '12px';
            }

            // Iframe requests to close (user clicked close inside iframe)
            if (event.data.type === 'zapien-close-request') {
                iframe.style.width = '64px';
                iframe.style.height = '64px';
                iframe.style.borderRadius = '999px';
                // Also notify iframe to hide internal chat UI
                iframe.contentWindow.postMessage({ type: 'zapien-close' }, '*');
            }
        });
  })();
</script>
<!-- End Pielo Chat Widget -->`;

            return { success: true, message: 'Embed code obtenido', data: { embedCode, chatbotId, chatbotName: chatbot.name, apiUrl, baseUrl } };
        } catch (error) {
            console.error('❌ ChatbotService.getEmbedCode:', error);
            return { success: false, message: error.message };
        }
    };

    getStats = async (chatbotId) => {
        try {
            const chatbot = await Chatbot.findById(chatbotId);
            if (!chatbot) return { success: false, message: 'Chatbot no encontrado' };

            return {
                success: true,
                message: 'Stats obtenidas',
                data: chatbot.stats
            };
        } catch (error) {
            console.error('❌ ChatbotService.getStats:', error);
            return { success: false, message: error.message };
        }
    };

    updateOpenaiConfig = async (chatbotId, configData) => {
        try {
            const chatbot = await Chatbot.findById(chatbotId);
            if (!chatbot) return { success: false, message: 'Chatbot no encontrado' };

            if (configData.openaiApiKey !== undefined) {
                chatbot.openaiApiKey = configData.openaiApiKey;
            }
            if (configData.openaiModel !== undefined) {
                chatbot.openaiModel = configData.openaiModel;
            }
            if (configData.openaiSettings !== undefined) {
                chatbot.openaiSettings = {
                    ...chatbot.openaiSettings,
                    ...configData.openaiSettings
                };
            }

            await chatbot.save();

            return {
                success: true,
                message: 'Configuración OpenAI actualizada',
                data: {
                    chatbotId: chatbot._id,
                    openaiModel: chatbot.openaiModel,
                    openaiSettings: chatbot.openaiSettings,
                    hasApiKey: !!chatbot.openaiApiKey
                }
            };
        } catch (error) {
            console.error('❌ ChatbotService.updateOpenaiConfig:', error);
            return { success: false, message: error.message };
        }
    };

    getOpenaiConfig = async (chatbotId) => {
        try {
            const chatbot = await Chatbot.findById(chatbotId);
            if (!chatbot) return { success: false, message: 'Chatbot no encontrado' };

            const response = {
                success: true,
                message: 'Configuración OpenAI obtenida',
                data: {
                    chatbotId: chatbot._id,
                    openaiModel: chatbot.openaiModel || 'gpt-3.5-turbo',
                    openaiSettings: {
                        temperature: chatbot.openaiSettings?.temperature ?? 0.7,
                        maxTokens: chatbot.openaiSettings?.maxTokens ?? 500,
                        topP: chatbot.openaiSettings?.topP ?? 1
                    },
                    hasApiKey: !!chatbot.openaiApiKey
                }
            };

            console.log('📤 getOpenaiConfig response:', JSON.stringify(response.data, null, 2));
            return response;
        } catch (error) {
            console.error('❌ ChatbotService.getOpenaiConfig:', error);
            return { success: false, message: error.message };
        }
    };
}
