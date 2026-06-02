import { OpenAI } from 'openai';

class OpenAIService {
  constructor() {
    this.tokenPrices = {
      'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-4-turbo': { input: 0.01, output: 0.03 }
    };
  }

  /**
   * Valida que la API key sea válida
   */
  async validateApiKey(apiKey) {
    try {
      const client = new OpenAI({ apiKey });
      const response = await client.models.list();
      return { valid: true, message: 'API key válida' };
    } catch (error) {
      if (error.status === 401) {
        return { valid: false, message: 'API key inválida o expirada' };
      }
      return { valid: false, message: error.message };
    }
  }

  /**
   * Genera respuesta usando OpenAI con contexto
   */
  async generateResponse(chatbot, userMessage, messages, options = {}) {
    try {
      if (!chatbot.openaiApiKey) {
        throw new Error('API key de OpenAI no configurada');
      }

      const client = new OpenAI({ apiKey: chatbot.openaiApiKey });
      const startTime = Date.now();

      const params = {
        model: chatbot.openaiModel,
        messages,
        temperature: chatbot.openaiSettings.temperature,
        max_tokens: chatbot.openaiSettings.maxTokens,
        top_p: chatbot.openaiSettings.topP,
      };

      if (options.tools) {
        params.tools = options.tools;
        params.tool_choice = 'auto';
      }

      const response = await client.chat.completions.create(params);

      const latencyMs = Date.now() - startTime;
      const tokensIn = response.usage.prompt_tokens;
      const tokensOut = response.usage.completion_tokens;
      const cost = this.calculateCost(chatbot.openaiModel, tokensIn, tokensOut);
      const choice = response.choices[0];

      return {
        content: choice.message.content,
        toolCall: choice.message.tool_calls?.[0] || null,
        finishReason: choice.finish_reason,
        tokensIn,
        tokensOut,
        cost,
        latencyMs,
        model: chatbot.openaiModel,
      };
    } catch (error) {
      throw new Error(this.handleError(error));
    }
  }

  /**
   * Calcula el costo en USD
   */
  calculateCost(model, tokensIn, tokensOut) {
    const prices = this.tokenPrices[model] || this.tokenPrices['gpt-3.5-turbo'];
    const costInput = (tokensIn / 1000) * prices.input;
    const costOutput = (tokensOut / 1000) * prices.output;
    return costInput + costOutput;
  }

  /**
   * Maneja errores de OpenAI con mensajes amigables
   */
  handleError(error) {
    const errorMap = {
      401: 'API key de OpenAI no válida. Por favor, verifica tu clave.',
      429: 'Has alcanzado el límite de requests. Intenta más tarde.',
      500: 'Error en el servidor de OpenAI. Intenta más tarde.',
      503: 'Servicio de OpenAI no disponible. Intenta más tarde.'
    };

    if (error.status && errorMap[error.status]) {
      return errorMap[error.status];
    }

    if (error.message.includes('API key')) {
      return 'Error de autenticación con OpenAI';
    }

    return 'Error al procesar tu mensaje. Intenta de nuevo.';
  }
}

export default new OpenAIService();
