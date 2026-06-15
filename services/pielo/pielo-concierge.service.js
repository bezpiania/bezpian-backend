import Chatbot from '../../models/Chatbot.js';
import AdvancedRAGService from '../rag/advanced-rag.service.js';

const advancedRag = new AdvancedRAGService();

/**
 * Concierge de Pielo — asistente ÚNICO de marketplace.
 * NO es el bot de una tienda: busca entre TODAS las tiendas con pieloEnabled
 * y recomienda. Reutiliza el motor RAG por tienda (con la key de cada tienda
 * para su propio catálogo), sin necesitar una key de plataforma.
 */
class PieloConciergeService {
  /**
   * Vitrina de descubrimiento: productos destacados (con foto) de las tiendas
   * Pielo + chips de antojos. Es el estado inicial del chat (impulso visual).
   */
  getDiscovery = async () => {
    const bots = await Chatbot.find({ pieloEnabled: true, status: 'active' })
      .select('name businessType widget');

    const featured = [];
    for (const bot of bots) {
      const Product = (await import('../../models/Product.js')).default;
      const prods = await Product.find({ chatbotId: bot._id, imageUrl: { $nin: [null, ''] } })
        .select('name price imageUrl')
        .limit(6)
        .lean();
      for (const p of prods) {
        featured.push({
          id: p._id,
          name: p.name,
          price: p.price,
          imageUrl: p.imageUrl,
          restaurant: { id: bot._id, name: bot.name, avatar: bot.widget?.avatar || '🍽️', color: bot.widget?.color || '#DCFF1E' },
        });
      }
    }
    // mezclar para variedad (orden estable basado en id)
    featured.sort((a, b) => String(a.id).localeCompare(String(b.id)));

    const chips = ['Pizza', 'Sushi', 'Hamburguesa', 'Completos', 'Algo dulce', 'Bebidas'];

    return { featured: featured.slice(0, 12), chips };
  };

  /** Detalle de un local + sus productos (para la pantalla del restaurante). */
  getRestaurant = async (id) => {
    const bot = await Chatbot.findOne({ _id: id, pieloEnabled: true, status: 'active' })
      .select('name businessType widget personality.welcomeMessage');
    if (!bot) return null;
    const Product = (await import('../../models/Product.js')).default;
    const products = await Product.find({ chatbotId: bot._id })
      .select('name description price imageUrl category')
      .lean();
    return {
      restaurant: {
        id: bot._id,
        name: bot.name,
        businessType: bot.businessType || 'generic',
        color: bot.widget?.color || '#DCFF1E',
        avatar: bot.widget?.avatar || '🍽️',
        welcomeMessage: bot.personality?.welcomeMessage || '',
      },
      products: products.map((p) => ({
        id: p._id, name: p.name, description: p.description || '',
        price: p.price, imageUrl: p.imageUrl || null, category: p.category || '',
      })),
    };
  };

  /** Detalle de un producto + su local. */
  getProduct = async (id) => {
    const Product = (await import('../../models/Product.js')).default;
    const p = await Product.findById(id).select('name description price imageUrl category chatbotId').lean();
    if (!p) return null;
    const bot = await Chatbot.findOne({ _id: p.chatbotId, pieloEnabled: true, status: 'active' })
      .select('name widget');
    if (!bot) return null;
    return {
      product: { id: p._id, name: p.name, description: p.description || '', price: p.price, imageUrl: p.imageUrl || null, category: p.category || '' },
      restaurant: { id: bot._id, name: bot.name, color: bot.widget?.color || '#DCFF1E', avatar: bot.widget?.avatar || '🍽️' },
    };
  };

  /** Tiendas activas en el marketplace. */
  getRestaurants = async () => {
    const bots = await Chatbot.find({ pieloEnabled: true, status: 'active' })
      .select('name businessType widget personality.welcomeMessage');
    return bots.map((b) => ({
      id: b._id,
      name: b.name,
      businessType: b.businessType || 'generic',
      color: b.widget?.color || '#DCFF1E',
      avatar: b.widget?.avatar || '🍽️',
    }));
  };

  /**
   * Busca un antojo entre todas las tiendas Pielo.
   * Devuelve resultados agrupados por tienda (solo las que tienen match).
   */
  search = async (query, perStoreLimit = 4) => {
    const bots = await Chatbot.find({ pieloEnabled: true, status: 'active' });
    const results = [];
    for (const bot of bots) {
      try {
        const products = await advancedRag.searchProducts(bot._id, query, perStoreLimit, bot.openaiApiKey);
        if (products && products.length > 0) {
          results.push({
            restaurant: {
              id: bot._id,
              name: bot.name,
              businessType: bot.businessType || 'generic',
              color: bot.widget?.color || '#DCFF1E',
              avatar: bot.widget?.avatar || '🍽️',
            },
            products: products.map((p) => ({
              id: p._id,
              name: p.name,
              description: p.description || '',
              price: p.price,
              imageUrl: p.imageUrl || null,
            })),
          });
        }
      } catch (e) {
        // si una tienda falla en su búsqueda, se ignora y se sigue con el resto
      }
    }
    return results;
  };

  /**
   * Mensaje del concierge: busca y arma una respuesta conversacional + datos.
   * (Fase 1: respuesta determinística clara. La capa LLM se puede sumar después.)
   */
  chat = async (message) => {
    const query = (message || '').trim();
    if (!query) {
      return { success: true, data: { reply: '¿Qué se te antoja hoy? Cuéntame y busco entre los locales disponibles.', results: [] } };
    }

    const results = await this.search(query);

    if (results.length === 0) {
      return {
        success: true,
        data: {
          reply: `No encontré "${query}" en los locales disponibles ahora. ¿Quieres probar con otra cosa?`,
          results: [],
        },
      };
    }

    const names = results.map((r) => r.restaurant.name);
    const lead = names.length === 1
      ? `Encontré ${query} en ${names[0]}.`
      : `Encontré ${query} en ${results.length} locales: ${names.join(', ')}.`;

    return {
      success: true,
      data: {
        reply: `${lead} ¿En cuál quieres pedir?`,
        results,
      },
    };
  };
}

export default new PieloConciergeService();
