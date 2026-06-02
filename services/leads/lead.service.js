import { Lead, Conversation, Chatbot } from '../../models/index.js';
import LeadExtractorService from './lead-extractor.service.js';
import logger from '../../utils/logger.js';

export default class LeadService {

    /**
     * Procesa un mensaje de usuario para detectar y guardar lead automáticamente
     */
    processMessageForLead = async (conversationId, userMessage, chatbotId, workspaceId) => {
        try {
            const result = {
                leadDetected: false,
                leadInfo: null,
                leadId: null,
                action: null
            };

            // 1. Obtener configuración del chatbot
            const chatbot = await Chatbot.findById(chatbotId);
            if (!chatbot) {
                logger.warn(`Chatbot ${chatbotId} no encontrado para lead extraction`);
                return result;
            }

            // 2. Obtener conversación actual
            const conversation = await Conversation.findById(conversationId);
            if (!conversation) {
                logger.warn(`Conversación ${conversationId} no encontrada`);
                return result;
            }

            // 3. Extraer información del mensaje actual
            const extractedInfo = LeadExtractorService.extractLeadInfo(userMessage);
            if (!extractedInfo.email && !extractedInfo.phone && !extractedInfo.name && !extractedInfo.company) {
                return result;
            }

            logger.info(`📋 Lead info extracted:`, extractedInfo);

            // 4. Acumular con información anterior
            const previousLeadInfo = conversation.leadInfo || {};
            const accumulatedInfo = LeadExtractorService.accumulateLeadInfo(previousLeadInfo, extractedInfo);

            // 5. Obtener campos requeridos
            const requiredFields = LeadExtractorService.getRequiredFields(chatbot);
            // requiredFields ahora es un array de strings: ['name', 'email', 'phone', ...]

            // 6. Verificar si está completo
            const isComplete = LeadExtractorService.isLeadComplete(accumulatedInfo, requiredFields);

            // 7. Guardar información en conversación
            conversation.leadInfo = accumulatedInfo;
            await conversation.save();

            result.leadInfo = accumulatedInfo;

            if (isComplete) {
                // 8. Crear el lead automáticamente
                const newLead = await Lead.create({
                    chatbotId,
                    workspaceId,
                    conversationId,
                    name: accumulatedInfo.name,
                    email: accumulatedInfo.email,
                    phone: accumulatedInfo.phone,
                    company: accumulatedInfo.company,
                    status: 'new'
                });

                logger.info(`✅ Lead creado automáticamente:`, {
                    leadId: newLead._id,
                    name: newLead.name,
                    email: newLead.email
                });

                result.leadDetected = true;
                result.leadId = newLead._id;
                result.action = 'lead_created';

                // Limpiar info de conversación
                conversation.leadInfo = null;
                await conversation.save();
            } else {
                result.action = 'lead_incomplete';
                const missingFields = LeadExtractorService.getMissingFieldsMessage(accumulatedInfo, requiredFields);
                result.missingFields = missingFields;
                logger.debug(`⏳ Lead incompleto. ${missingFields}`);
            }

            return result;
        } catch (error) {
            logger.error('❌ Error procesando mensaje para lead:', error);
            return {
                leadDetected: false,
                leadInfo: null,
                leadId: null,
                action: 'error',
                error: error.message
            };
        }
    };

    list = async (workspaceId, filters = {}) => {
        try {
            let query = { workspaceId };
            if (filters.status) query.status = filters.status;
            if (filters.search) query.email = { $regex: filters.search, $options: 'i' };

            const leads = await Lead.find(query).sort({ createdAt: -1 });
            return { success: true, message: 'Leads obtenidos', data: leads };
        } catch (error) {
            console.error('❌ LeadService.list:', error);
            return { success: false, message: error.message };
        }
    };

    get = async (leadId) => {
        try {
            const lead = await Lead.findById(leadId);
            if (!lead) return { success: false, message: 'Lead no encontrado' };
            return { success: true, message: 'Lead obtenido', data: lead };
        } catch (error) {
            console.error('❌ LeadService.get:', error);
            return { success: false, message: error.message };
        }
    };

    update = async (leadId, updates) => {
        try {
            const lead = await Lead.findByIdAndUpdate(leadId, updates, { new: true });
            return { success: true, message: 'Lead actualizado', data: lead };
        } catch (error) {
            console.error('❌ LeadService.update:', error);
            return { success: false, message: error.message };
        }
    };

    delete = async (leadId) => {
        try {
            await Lead.deleteOne({ _id: leadId });
            return { success: true, message: 'Lead eliminado' };
        } catch (error) {
            console.error('❌ LeadService.delete:', error);
            return { success: false, message: error.message };
        }
    };

    export = async (workspaceId, filters = {}) => {
        try {
            // TODO: Generate CSV from leads
            return { success: true, message: 'Exportación generada', data: { csvUrl: '' } };
        } catch (error) {
            console.error('❌ LeadService.export:', error);
            return { success: false, message: error.message };
        }
    };
}
