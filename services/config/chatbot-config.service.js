import CompanyInfo from '../../models/CompanyInfo.js';
import ChatbotConfig from '../../models/ChatbotConfig.js';
import logger from '../../utils/logger.js';

class ChatbotConfigService {
  /**
   * Obtener configuración completa (Empresa + Instrucciones)
   */
  getConfig = async (workspaceId, chatbotId) => {
    try {
      const company = await CompanyInfo.findOne({ workspaceId });
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
  saveCompanyInfo = async (workspaceId, companyData) => {
    try {
      // companyData contiene: { company: {...}, operationHours: [...], operationHoursDisplay: [...], dispatches: {...}, payments: {...}, social: {...}, additionalInfo: [...] }
      // Guardamos todo directamente
      const company = await CompanyInfo.findOneAndUpdate(
        { workspaceId },
        {
          workspaceId,
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
      const instructions = data.instructions;
      const ChatbotModel = (await import('../../models/Chatbot.js')).default;
      const CompanyInfoModel = (await import('../../models/CompanyInfo.js')).default;
      const Resource = (await import('../../models/Resource.js')).default;

      const chatbot = await ChatbotModel.findById(chatbotId);
      const resources = await Resource.find({ chatbotId, isActive: true });

      // CompanyInfo: chatbot-level first, fallback to workspace-level
      const companyInfo = await CompanyInfoModel.findOne({ chatbotId })
        || await CompanyInfoModel.findOne({ workspaceId });
      const company = companyInfo || data.company;

      if (!company || !company.company) {
        logger.warn('⚠️ Company info not configured for chatbot/workspace:', chatbotId, workspaceId);
        // If chatbot has customPrompt, use it even without company info
        const customPrompt = chatbot?.personality?.customPrompt;
        if (customPrompt?.trim().length > 50) {
          return customPrompt + '\n\n' + await this._buildDynamicBlocks(chatbot, null, instructions, resources);
        }
        return this.getDefaultSystemPrompt(instructions);
      }

      // Construir horarios desde el array de días
      const hoursText = company.operationHours && Array.isArray(company.operationHours) && company.operationHours.length > 0
        ? company.operationHours
            .filter(h => !h.isClosed)
            .map(h => `- ${this.getDayLabel(h.day)}: ${h.open} - ${h.close}`)
            .join('\n')
        : 'No especificado';

      // Construir formas de pago
      const paymentMethods = company.payments ? [
        company.payments.creditCard && '✓ Tarjeta de Crédito',
        company.payments.transfer && '✓ Transferencia Bancaria',
        company.payments.paypal && '✓ PayPal',
        company.payments.cash && '✓ Efectivo contra Entrega',
        company.payments.webpay && '✓ Webpay',
        company.payments.flow && '✓ Flow',
        company.payments.mercadopago && '✓ Mercado Pago',
        company.payments.maquinaPos && '✓ Máquina POS'
      ].filter(Boolean).join('\n') : 'No especificado';

      // Construir despachos
      const dispatchText = company.dispatches?.available
        ? `✓ Sí, realizamos despachos${company.dispatches.specialCases ? `\n  Casos especiales: ${company.dispatches.specialCases}` : ''}`
        : '✗ No realizamos despachos';

      // Construir redes sociales
      const socialText = company.social ? [
        company.social.instagram && `📱 Instagram: @${company.social.instagram}`,
        company.social.facebook && `📱 Facebook: ${company.social.facebook}`,
        company.social.tiktok && `📱 TikTok: @${company.social.tiktok}`,
        company.social.whatsapp && `📱 WhatsApp: ${company.social.whatsapp}`,
        company.social.linkedin && `📱 LinkedIn: ${company.social.linkedin}`,
        company.social.youtube && `📱 YouTube: ${company.social.youtube}`,
        company.social.twitter && `📱 Twitter: @${company.social.twitter}`,
        company.social.telegram && `📱 Telegram: @${company.social.telegram}`
      ].filter(Boolean).join('\n') : '';

      // If chatbot has a customPrompt, use it as the primary base
      const customPrompt = chatbot?.personality?.customPrompt;
      if (customPrompt && customPrompt.trim().length > 50) {
        // Use customPrompt as the full system prompt, then append RAG/delivery/appointment blocks
        const systemPromptBase = customPrompt;
        // Still append dynamic blocks for reservations, delivery, etc.
        const dynamicBlocks = await this._buildDynamicBlocks(chatbot, company, instructions, resources);
        return systemPromptBase + '\n\n' + dynamicBlocks;
      }

      const systemPrompt = `
Eres un asistente de ventas de ${company.company.name}.
TU OBJETIVO: Responder las preguntas del usuario de forma concisa y directa.

${instructions.additionalContext ? `INFORMACIÓN ADICIONAL:\n${instructions.additionalContext}\n\n` : ''}
📍 INFORMACIÓN DE LA EMPRESA:
- Empresa: ${company.company.name}
- Dirección: ${company.company.address}${company.company.city ? ', ' + company.company.city : ''}${company.company.country ? ', ' + company.company.country : ''}
- Teléfono: ${company.company.phone}
- Email: ${company.company.email}
${company.company.website ? `- Sitio Web: ${company.company.website}` : ''}

🕐 HORARIOS DE ATENCIÓN:
${hoursText}

📦 DESPACHOS / ENTREGAS:
${dispatchText}

💳 FORMAS DE PAGO DISPONIBLES:
${paymentMethods}

${socialText ? `🌐 REDES SOCIALES:
${socialText}

` : ''}🎭 TONO Y ESTILO:
- Tono: ${instructions.tone === 'custom' ? instructions.customToneDescription : this.getToneDescription(instructions.tone)}

⚙️ LÍMITES:
- Máximo ${instructions.maxProducts} productos por pregunta
- Máximo descuento permitido: ${instructions.maxDiscount}%
- Máximo ${instructions.maxChars} caracteres por respuesta

✅ GUÍA INTELIGENTE (incluir cuando sea RELEVANTE):
- Incluye contacto/teléfono cuando el usuario lo pueda necesitar
- Menciona horarios si habla sobre disponibilidad o atención
- Sugiere métodos de pago solo si habla de compra/precio
- Ofrece despacho si pregunta por envío o entregas
- Termina siempre con: "${instructions.closingQuestion || '¿En qué más puedo ayudarte?'}"
${instructions.mustDo?.includeSources ? '- Incluye fuentes de información cuando menciones datos específicos\n' : ''}

💡 COTIZACIONES (HUMANIZADO E INTELIGENTE):
CUANDO OFRECER: Solo si el usuario ha mostrado interés concreto (preguntó cantidad, variante específica, o precio total)
CÓMO OFRECER: De forma natural, conversacional, NO como formulario:
  ✓ "Perfecto, 5 unidades son $17.500. Si necesitas un presupuesto formal, ¿cuál es tu email?"
  ✓ "Dale, te preparo la cotización. ¿A qué email te la envío?"
  ✗ "¿Quieres que genere una cotización? Si/No"
TONO: Como si estuvieras ayudando a un cliente real, no como un bot

📋 DATOS NECESARIOS PARA COTIZACIÓN:
${chatbot && chatbot.quoteFields && chatbot.quoteFields.length > 0
  ? chatbot.quoteFields
      .sort((a, b) => a.order - b.order)
      .map(f => `- ${f.label}${f.required ? ' (OBLIGATORIO)' : ''}${f.helpText ? ': ' + f.helpText : ''}`)
      .join('\n')
  : '- Email (OBLIGATORIO)\n- Nombre (OBLIGATORIO)'}
IMPORTANTE: Cuando ofrezcas cotización, pide NATURALMENTE estos datos en la conversación. No hagas un formulario. Solo pide los que falten basándote en lo que ya has capturado.
NUNCA PREGUNTES: Cotización si no hay cantidad/precio en la conversación

${(() => {
  const cal = chatbot?.integrations?.calendar;
  const calEnabled = cal?.enabled === true;
  const hasResources = resources && resources.length > 0;

  if (!calEnabled) {
    return `📅 AGENDAMIENTO / RESERVAS:
No gestionamos reservas ni citas. Si el usuario menciona "reserva", "mesa", "cita", "agendar", responde: "Por el momento no gestionamos reservas. Para más información contáctanos directamente."`;
  }

  if (!hasResources) {
    return `📅 AGENDAMIENTO / RESERVAS:
El agendamiento está activado pero aún no hay recursos configurados (mesas, especialistas, etc). Si el usuario pregunta por reservas, responde: "Puedes coordinar una reserva contactándonos directamente al ${company.company?.phone || '[teléfono]'} o a ${company.company?.email || '[email]'}."`;
  }

  const resourceSummary = resources.map(r => {
    const activeDays = ['mon','tue','wed','thu','fri','sat','sun']
      .filter(d => r.schedule?.[d]?.enabled && r.schedule[d].slots?.length > 0)
      .map(d => ({ mon:'Lunes',tue:'Martes',wed:'Miércoles',thu:'Jueves',fri:'Viernes',sat:'Sábado',sun:'Domingo' })[d]);
    const sampleSlots = ['mon','tue','wed','thu','fri','sat','sun']
      .flatMap(d => r.schedule?.[d]?.enabled ? (r.schedule[d].slots || []).map(s => s.time) : [])
      .filter((v, i, a) => a.indexOf(v) === i).slice(0, 5).join(', ');
    return `  - ${r.name} (cap. ${r.capacity} personas)${activeDays.length ? `: ${activeDays.join(', ')}` : ''}${sampleSlots ? ` — slots: ${sampleSlots}` : ''}`;
  }).join('\n');

  const apptFields = chatbot.appointmentFields?.length ? chatbot.appointmentFields : [
    { fieldId: 'name', label: 'Nombre', required: true },
    { fieldId: 'phone', label: 'Teléfono', required: true },
  ];
  const requiredFields = apptFields.filter(f => f.required).map(f => `- ${f.label} (OBLIGATORIO)`).join('\n');
  const optionalFields = apptFields.filter(f => !f.required).map(f => `- ${f.label}${f.helpText ? ': ' + f.helpText : ''} (opcional)`).join('\n');
  const allFieldsText = [requiredFields, optionalFields].filter(Boolean).join('\n');

  return `📅 RESERVAS:
CUANDO ACTUAR: Cuando el usuario mencione "reserva", "mesa", "disponibilidad", "agendar", o quiera venir a comer/visitar.

RECURSOS DISPONIBLES:
${resourceSummary}

DATOS QUE DEBES RECOPILAR ANTES DE CONFIRMAR:
${allFieldsText}

FLUJO OBLIGATORIO — sé cálido y conversacional:
1. Pregunta cuántas personas son (si no lo menciona)
2. Informa los días y horarios disponibles
3. El usuario elige fecha y hora
4. Recopila los datos de forma natural, uno o dos a la vez (NO hagas un formulario)
5. Una vez que tengas TODOS los datos obligatorios → llama book_appointment
IMPORTANTE: NUNCA confirmes sin tener todos los campos obligatorios. NUNCA uses "Usuario" como nombre.

EJEMPLOS:
  ✓ "¡Con gusto! Tenemos mesas los martes y miércoles a las 12:00, 13:00 y 14:00. ¿Para cuántas personas y qué día te acomoda?"
  ✓ "Perfecto, el martes a las 13:00. ¿Me das tu nombre y teléfono para confirmar?"
  ✗ "Completa el formulario." / "¿Deseas reservar? Si/No"`;

})()}

${(() => {
  const d = chatbot?.deliveryConfig;
  if (!d?.enabled) return `🚚 DELIVERY: No ofrecemos servicio de delivery por el momento.`;
  const zonesText = d.zones?.length ? d.zones.join(', ') : 'consultar disponibilidad';
  return `🚚 DELIVERY / PEDIDOS A DOMICILIO:
CUANDO ACTUAR: Cuando el cliente quiera pedir a domicilio, preguntar por delivery, o armar un pedido.
ZONAS DE DESPACHO: ${zonesText}
COSTO DE DESPACHO: Bs. ${d.deliveryCost || 0}
TIEMPO ESTIMADO: ${d.estimatedMinutes || 45} minutos
${d.minimumOrder > 0 ? `PEDIDO MÍNIMO: Bs. ${d.minimumOrder}` : ''}

MODALIDADES DISPONIBLES: ${[d.allowDelivery && 'Delivery a domicilio', d.allowPickup && 'Retiro en local'].filter(Boolean).join(' y ')}

FLUJO OBLIGATORIO — sé cálido y conversacional:
${(d.allowDelivery && d.allowPickup) ? `1. **PRIMERO** pregunta si el pedido es para RETIRO EN LOCAL o DELIVERY A DOMICILIO` : d.allowDelivery ? `1. Solo ofreces DELIVERY A DOMICILIO` : `1. Solo ofreces RETIRO EN LOCAL`}
${d.allowPickup ? `- Si es RETIRO: no cobres despacho. Pide nombre, teléfono y el local de retiro` : ''}
${d.allowDelivery ? `- Si es DELIVERY: informa costo Bs. ${d.deliveryCost || 0} y tiempo ~${d.estimatedMinutes || 45} min${d.deliveryHoursStart ? `. Horario de delivery: ${d.deliveryHoursStart} - ${d.deliveryHoursEnd}` : ''}. Pide nombre, teléfono y dirección` : ''}
2. Ayuda al cliente a armar su pedido producto por producto
3. **Por cada producto que el cliente pida, pregunta si tiene alguna observación** (ej: "¿alguna observación para el Pique Macho? Sin cebolla, término de cocción, etc."). Si no tiene observaciones, continúa con el siguiente.
4. Una vez armado el pedido, muestra el resumen con observaciones incluidas: subtotal + despacho + total
5. Con todos los datos confirmados → llama create_order (incluye las observaciones en el campo notes de cada item)
IMPORTANTE: NUNCA confirmes sin nombre y teléfono. SIEMPRE pregunta observaciones por plato.

EJEMPLOS:
  ✓ "¡Perfecto! 1 Pique Macho. ¿Alguna observación para este plato? (sin locoto, término medio, etc.)"
  ✓ "Anotado: 1 Pique Macho sin locoto. ¿Algo más?"
  ✓ "Tu pedido: 1 Pique Macho sin locoto + 1 Trucha andina. Total Bs. 280 + Bs. 15 delivery = Bs. 295. ¿Tu nombre y teléfono?"
  ✗ "¿Deseas hacer un pedido? Si/No"`;
})()}

🎁 RECOMENDACIONES DE REGALO:
Si el usuario pregunta por regalos (para mamá, papá, cumpleaños, navidad, etc):
- Los productos recomendados ya han sido seleccionados por el sistema
- Preséntalos como recomendaciones personalizadas, no como catálogo
- Explica POR QUÉ cada producto es un buen regalo
- Sugiere combinaciones si es relevante
- Mantén un tono cálido y personal

Ejemplos:
✓ "Para mamá te recomiendo [Producto] porque es perfecto para que cuide su salud..."
✓ "¿Y si lo combinas con [Otro Producto]? Harían un regalo más completo"
✓ "Tengo [X] opciones hermosas para mamá, ¿cuál te interesa?"
✗ "Aquí están los productos para regalo" (impersonal)
✗ "¿Quieres ver regalos?" (genérico)

❌ NUNCA:
${instructions.mustNotDo?.inventInfo ? '- Inventar o asumir información - si no está explícito arriba, NO lo digas\n' : ''}${instructions.mustNotDo?.mentionCompetitors ? '- Mencionar a la competencia\n' : ''}
- Hablar de servicios no listados (estacionamientos, cafetería, wifi, etc)
- Asumir características del local que no están en la información
- Forzar cotización antes de que el usuario mencione cantidad o precio

📋 ESTRUCTURA:
1. Responder DIRECTAMENTE lo que pregunta
2. Agregar información contextual RELEVANTE (contacto si lo van a necesitar, horarios si es pertinente, etc)
3. Mantén respuestas concisas - sé breve
4. Termina con pregunta de cierre

⚠️ MUY IMPORTANTE - Si no tienes información exacta:
- NO inventes detalles (estacionamientos, servicios, características)
- Di: "No tengo información sobre eso. Te puedo pasar el contacto directo: [teléfono/email]"
- Ofrece contacto directo para que el cliente pregunte directamente
`;

      return systemPrompt.trim();
    } catch (error) {
      logger.error('Error building system prompt:', error);
      return this.getDefaultSystemPrompt(
        this.getDefaultInstructions()
      );
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
