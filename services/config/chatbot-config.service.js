import CompanyInfo from '../../models/CompanyInfo.js';
import ChatbotConfig from '../../models/ChatbotConfig.js';
import Chatbot from '../../models/Chatbot.js';
import Resource from '../../models/Resource.js';
import logger from '../../utils/logger.js';

class ChatbotConfigService {
  /**
   * Obtener configuración completa (Empresa + Instrucciones)
   */
  getConfig = async (workspaceId, chatbotId) => {
    try {
      // Always look by chatbotId first — each bot has its own CompanyInfo
      // Falls back to workspaceId only if no chatbot-specific record exists
      const company = chatbotId
        ? (await CompanyInfo.findOne({ chatbotId }) || await CompanyInfo.findOne({ workspaceId, chatbotId: null }))
        : await CompanyInfo.findOne({ workspaceId });
      const config = await ChatbotConfig.findOne({ chatbotId });

      return {
        success: true,
        data: {
          company: company || null,
          instructions: config?.instructions || this.getDefaultInstructions()
        }
      };
    } catch (error) {
      logger.error('Error getting chatbot config:', error);
      throw error;
    }
  };

  /**
   * Guardar información de empresa
   */
  saveCompanyInfo = async (workspaceId, companyData, chatbotId = null) => {
    try {
      const filter = chatbotId ? { chatbotId } : { workspaceId, chatbotId: null };
      const company = await CompanyInfo.findOneAndUpdate(
        filter,
        {
          workspaceId,
          chatbotId: chatbotId || undefined,
          company: companyData.company || {},
          operationHours: companyData.operationHours || [],
          operationHoursDisplay: companyData.operationHoursDisplay || [],
          dispatches: companyData.dispatches || {},
          payments: companyData.payments || {},
          social: companyData.social || {},
          additionalInfo: companyData.additionalInfo || []
        },
        { upsert: true, new: true }
      );

      logger.info('✅ Company info saved:', { workspaceId, name: company.company?.name, additionalInfoCount: company.additionalInfo?.length });
      return { success: true, data: company };
    } catch (error) {
      logger.error('Error saving company info:', error);
      throw error;
    }
  };

  /**
   * Guardar instrucciones del chatbot
   */
  saveInstructions = async (chatbotId, instructionsData) => {
    try {
      const config = await ChatbotConfig.findOneAndUpdate(
        { chatbotId },
        { chatbotId, instructions: instructionsData },
        { upsert: true, new: true }
      );

      logger.info('✅ Instructions saved:', { chatbotId });
      return { success: true, data: config };
    } catch (error) {
      logger.error('Error saving instructions:', error);
      throw error;
    }
  };

  /**
   * Obtener instrucciones por default
   */
  getDefaultInstructions = () => {
    return {
      tone: 'amigable',
      customToneDescription: '',
      additionalContext: '',
      maxProducts: 5,
      maxDiscount: 20,
      maxChars: 500,
      mustDo: {
        mentionHours: true,
        suggestPayment: true,
        includeSources: true
      },
      mustNotDo: {
        inventInfo: true,
        mentionCompetitors: true
      },
      closingQuestion: '¿En qué más puedo ayudarte?',
      mustInclude: {
        sources: true,
        hours: true,
        payments: true,
        dispatch: true
      }
    };
  };

  /**
   * Construir system prompt basándose en la configuración
   */
  buildSystemPrompt = async (workspaceId, chatbotId) => {
    try {
      const { data } = await this.getConfig(workspaceId, chatbotId);
      const instructions = data.instructions || this.getDefaultInstructions();
      const chatbot = await Chatbot.findById(chatbotId);
      const resources = await Resource.find({ chatbotId, isActive: true });

      // CompanyInfo: always by chatbotId first
      const company = await CompanyInfo.findOne({ chatbotId })
        || await CompanyInfo.findOne({ workspaceId });

      // ── 1. IDENTITY ──────────────────────────────────────────────────────
      const botName = instructions.assistantName || chatbot?.name || 'Asistente';
      const companyName = company?.company?.name || chatbot?.name || 'la empresa';
      const toneMap = {
        amigable:    'Cálido, cercano y empático. Usas emojis con moderación.',
        profesional: 'Profesional y confiable. Lenguaje formal pero accesible.',
        casual:      'Relajado y conversacional, como un amigo que ayuda.',
        formal:      'Formal y corporativo. Sin emojis. Trato de usted.',
      };
      const toneDesc = toneMap[instructions.tone] || toneMap.amigable;
      const langInstr = instructions.language === 'es'
        ? 'Siempre responde en español.'
        : instructions.language === 'en'
        ? 'Always respond in English.'
        : 'Responde en el idioma que use el cliente.';

      // ── 2. COMPANY DATA ──────────────────────────────────────────────────
      const c = company?.company || {};
      const hours = company?.operationHours?.filter(h => !h.isClosed)
        .map(h => `${this.getDayLabel(h.day)}: ${h.open}–${h.close}`).join(' | ') || 'No especificado';
      const social = company?.social ? [
        company.social.instagram && `Instagram: @${company.social.instagram}`,
        company.social.facebook  && `Facebook: ${company.social.facebook}`,
        company.social.whatsapp  && `WhatsApp: ${company.social.whatsapp}`,
        company.social.youtube   && `YouTube: ${company.social.youtube}`,
      ].filter(Boolean).join(' | ') : '';
      const payments = company?.payments ? [
        company.payments.creditCard  && 'Tarjeta crédito/débito',
        company.payments.transfer    && 'Transferencia bancaria',
        company.payments.cash        && 'Efectivo',
        company.payments.webpay      && 'Webpay',
        company.payments.mercadopago && 'Mercado Pago',
        company.payments.maquinaPos  && 'POS',
      ].filter(Boolean).join(', ') : '';

      // ── 3. CUSTOM RULES ──────────────────────────────────────────────────
      const customRulesText = instructions.customRules?.length
        ? instructions.customRules.map(r => `- ${r}`).join('\n')
        : '';
      const restrictionsText = instructions.restrictions?.length
        ? instructions.restrictions.map(r => `- ${r}`).join('\n')
        : '';

      // ── 4. APPOINTMENT FIELDS ────────────────────────────────────────────
      const apptFields = chatbot?.appointmentFields || [];
      const requiredApptFields = apptFields.filter(f => f.required === true);

      // ── 5. BUILD PROMPT ──────────────────────────────────────────────────
      let prompt = `Eres ${botName}, el asistente IA de ${companyName}.

🎭 TONO Y ESTILO:
${toneDesc}
${langInstr}

📍 INFORMACIÓN DE LA EMPRESA:
- Nombre: ${companyName}
${c.address ? `- Dirección: ${c.address}` : ''}
${c.phone   ? `- Teléfono: ${c.phone}` : ''}
${c.email   ? `- Email: ${c.email}` : ''}
${c.website ? `- Web: ${c.website}` : ''}
${social    ? `- Redes: ${social}` : ''}

🕐 HORARIOS DE ATENCIÓN:
${hours}

${payments ? `💳 FORMAS DE PAGO: ${payments}` : ''}`;

      // Company description if available
      if (c.description) {
        prompt += `\n\n📌 SOBRE NOSOTROS:\n${c.description}`;
      }

      // Additional info / FAQ
      const additionalInfo = company?.additionalInfo || [];
      if (additionalInfo.length > 0) {
        const faqText = additionalInfo
          .filter(item => item.question && item.answer)
          .map(item => `P: ${item.question}\nR: ${item.answer}`)
          .join('\n\n');
        if (faqText) {
          prompt += `\n\n📚 INFORMACIÓN ADICIONAL Y PREGUNTAS FRECUENTES:\n${faqText}`;
        }
      }

      // Custom rules
      if (customRulesText) {
        prompt += `\n\n✅ REGLAS ADICIONALES:\n${customRulesText}`;
      }
      // Universal anti-hallucination rule always added
      const antiHallucination = `- REGLA CRÍTICA: Si alguien pregunta por algo que NO está explícitamente en este prompt (estacionamiento, wifi, capacidad, servicios especiales, etc.), NUNCA respondas afirmativamente ni inventes. Responde: "No tengo esa información. Te recomiendo consultar directamente al ${c.phone || '[teléfono]'}"`;

      if (restrictionsText) {
        prompt += `\n\n❌ NO HACER:\n${restrictionsText}\n${antiHallucination}`;
      } else {
        prompt += `\n\n❌ NO HACER:\n- Inventar información que no está en este prompt\n${antiHallucination}`;
      }

      // Closing question
      const closing = instructions.closingQuestion || '¿En qué más puedo ayudarte?';
      prompt += `\n\nSIEMPRE termina con: "${closing}"`;

      // ── APPOINTMENTS BLOCK ───────────────────────────────────────────────
      const calEnabled = chatbot?.integrations?.calendar?.enabled === true;
      if (calEnabled && resources.length > 0) {
        const resourceSummary = resources.slice(0, 8).map(r => {
          const days = ['mon','tue','wed','thu','fri','sat','sun']
            .filter(d => r.schedule?.[d]?.enabled && r.schedule[d].slots?.length)
            .map(d => ({'mon':'Lunes','tue':'Martes','wed':'Miércoles','thu':'Jueves','fri':'Viernes','sat':'Sábado','sun':'Domingo'})[d]);
          const slots = ['mon','tue','wed','thu','fri','sat','sun']
            .flatMap(d => r.schedule?.[d]?.enabled ? (r.schedule[d].slots||[]).map(s => s.time) : [])
            .filter((v,i,a) => a.indexOf(v)===i).slice(0,5).join(', ');
          return `  - ${r.name} (cap.${r.capacity})${days.length ? ': '+days.join(', ') : ''}${slots ? ' — '+slots : ''}`;
        }).join('\n');

        const reqFields = requiredApptFields.map(f => `- ${f.label} (OBLIGATORIO)`).join('\n');
        const optFields = apptFields.filter(f => !f.required).map(f => `- ${f.label} (opcional)`).join('\n');

        // Build per-resource availability summary for natural language queries
        const availabilitySummary = resources.slice(0, 8).map(r => {
          const DAY_MAP = {'mon':'lunes','tue':'martes','wed':'miércoles','thu':'jueves','fri':'viernes','sat':'sábado','sun':'domingo'};
          const workDays = ['mon','tue','wed','thu','fri','sat','sun'].filter(d => r.schedule?.[d]?.enabled && r.schedule[d].slots?.length).map(d => DAY_MAP[d]);
          const offDays  = ['mon','tue','wed','thu','fri','sat','sun'].filter(d => !r.schedule?.[d]?.enabled || !r.schedule[d].slots?.length).map(d => DAY_MAP[d]);
          return `  • ${r.name}: trabaja ${workDays.join(', ')}. NO trabaja ${offDays.join(', ')}.`;
        }).join('\n');

        prompt += `\n\n📅 RESERVAS:
DISPONIBILIDAD POR ESPECIALISTA:\n${availabilitySummary}
RECURSOS: \n${resourceSummary}
DATOS A RECOPILAR: \n${reqFields}\n${optFields}
FLUJO: Pregunta qué servicio desea → pregunta con qué especialista → pregunta fecha y hora → pide nombre y teléfono → muestra resumen → espera SÍ → llama book_appointment
CANCELACIONES: Si el cliente quiere cancelar o modificar una reserva, indícale que debe contactar directamente al local por teléfono o en persona. No puedes cancelar reservas desde este chat.`;
      } else if (!calEnabled) {
        prompt += `\n\n📅 RESERVAS: No gestionamos reservas por este canal.`;
      }

      // ── DELIVERY BLOCK ───────────────────────────────────────────────────
      const d = chatbot?.deliveryConfig;
      if (d?.enabled) {
        const modes = [d.allowDelivery && 'Delivery', d.allowPickup && 'Retiro en local'].filter(Boolean).join(' y ');
        prompt += `\n\n🚚 DELIVERY:
Modalidades: ${modes}
${d.allowDelivery ? `Costo: ${d.deliveryCost || 0} | Tiempo: ~${d.estimatedMinutes || 45} min | Mínimo: ${d.minimumOrder || 0}` : ''}
${d.zones?.length ? `Zonas: ${d.zones.join(', ')}` : ''}
REGLAS CRÍTICAS DE PEDIDOS:
- En cuanto tengas los PRODUCTOS + DIRECCIÓN DE ENTREGA (o "retiro"), llama create_order INMEDIATAMENTE. No hagas preguntas adicionales.
- Si el usuario pide delivery pero no dio dirección, pide SOLO la dirección. Nada más.
- NO pidas confirmación adicional ni hagas resumen antes de llamar create_order — el sistema lo muestra automáticamente.
- NO digas "voy a registrar" o "procederé a" — simplemente llama create_order.
- Si el usuario agrega más productos o cambia la dirección, llama create_order de nuevo con los datos actualizados.`;
      } else if (d !== undefined) {
        prompt += `\n\n🚚 DELIVERY: No ofrecemos delivery por el momento.`;
      }

      // ── STORE BLOCK ──────────────────────────────────────────────────────
      if (chatbot?.businessType === 'store') {
        const qc = chatbot.quoteConfig || {};
        prompt += `\n\n🛍️ TIENDA:
- Para productos con variantes (talla/color/modelo) SIEMPRE pregunta la variante antes de agregar al pedido
- Si el producto está agotado, ofrece alternativas
${qc.enabled ? `- Para +${qc.autoQuoteMinQty||10} unidades ofrece cotización formal` : ''}
- Búsqueda técnica: ayuda a encontrar por marca, modelo compatible, especificaciones`;
      }

      return prompt.trim();

    } catch (error) {
      logger.error('Error building system prompt:', error);
      return this.getDefaultSystemPrompt(this.getDefaultInstructions());
    }
  };


  // Extracts just the dynamic blocks (reservations, delivery, sales) to append to customPrompt
  _buildDynamicBlocks = async (chatbot, company, instructions, resources) => {
    const blocks = [];
    // Appointment block
    const calEnabled = chatbot?.integrations?.calendar?.enabled;
    const hasResources = resources?.length > 0;
    if (calEnabled && hasResources) {
      const resourceSummary = resources.slice(0, 5).map(r => `  - ${r.name} (cap. ${r.capacity} personas)`).join('\n');
      blocks.push(`\n📅 RESERVAS:\nDisponemos de mesas para reservar. Recursos: \n${resourceSummary}`);
    }
    // Delivery block
    const d = chatbot?.deliveryConfig;
    if (d?.enabled) {
      blocks.push(`\n🚚 DELIVERY/PEDIDOS: Costo Bs.${d.deliveryCost||0}, tiempo ~${d.estimatedMinutes||45}min, mínimo Bs.${d.minimumOrder||0}. Modalidades: ${[d.allowDelivery&&'Delivery',d.allowPickup&&'Retiro'].filter(Boolean).join(' y ')}.`);
    }
    return blocks.join('\n');
  };

  getDayLabel = (day) => {
    const labels = {
      monday: 'Lunes',
      tuesday: 'Martes',
      wednesday: 'Miércoles',
      thursday: 'Jueves',
      friday: 'Viernes',
      saturday: 'Sábado',
      sunday: 'Domingo'
    };
    return labels[day] || day;
  };

  /**
   * System prompt por defecto
   */
  getDefaultSystemPrompt = (instructions) => {
    return `
Eres un asistente de ventas amigable y profesional.

🎭 TONO: ${this.getToneDescription(instructions.tone)}

⚙️ LÍMITES:
- Máximo ${instructions.maxProducts} productos por respuesta
- Máximo descuento: ${instructions.maxDiscount}%
- Máximo ${instructions.maxChars} caracteres

📋 CATÁLOGO DE PRODUCTOS:
IMPORTANTE: Tu único catálogo de productos es el que se proporciona a continuación.
- Si el usuario pregunta por un producto específico, BUSCA en la lista de productos proporcionada
- Si el producto existe en el catálogo, SIEMPRE incluye: nombre, descripción, precio y stock disponible
- Si pregunta por un producto que NO está en el catálogo, responde claramente que "No tenemos ese producto en este momento"
- Cuando menciones un producto, verifica siempre el stock: si stock > 0, está disponible; si stock = 0, NO está disponible

✅ DEBES:
- Ser útil y respetuoso
- RESPONDER SOLO basándote en el catálogo proporcionado abajo
- Incluir stock y disponibilidad al hablar de productos
- Mencionar precio en CLP
- Sonar como una persona, no como un bot

❌ NO DEBES:
- Inventar productos que no están en el catálogo
- Asumir disponibilidad sin verificar stock
- Hacer promesas sobre productos no listados
- Forzar una cotización si el cliente no ha mencionado cantidad

💡 COTIZACIONES (HUMANIZADO):
- Si el cliente pregunta por cantidad/variante específica: Calcula el total naturalmente
- Luego, ofrece cotización de forma casual: "Si necesitas un presupuesto formal, ¿cuál es tu email?"
- NUNCA preguntes "¿Quieres cotización?" como un formulario - hazlo conversacional
- Tono: Como si ayudaras a un cliente real en una tienda, no como un bot

🎬 CIERRE:
${instructions.closingQuestion}
`;
  };

  /**
   * Descripción del tono
   */
  getToneDescription = (tone) => {
    const descriptions = {
      formal: '🎩 Formal y profesional, mantén distancia respetuosa',
      amigable: '😊 Amigable y cercano, genera confianza',
      casual: '😎 Casual y desenfadado, sé como un amigo',
      custom: 'Personalizado'
    };
    return descriptions[tone] || descriptions.amigable;
  };
}

export default new ChatbotConfigService();
