import Chatbot from '../../models/Chatbot.js';
import { PieloOrder } from '../../models/pielo/index.js';

/**
 * Pedidos del marketplace Pielo. Crea pedidos contra una tienda (Chatbot)
 * y los consulta por consumidor.
 */
class PieloOrderService {
  create = async (pieloUser, payload) => {
    const { chatbotId, items, deliveryAddress, notes, deliveryCost } = payload || {};

    if (!chatbotId) return { success: false, message: 'Falta la tienda (chatbotId)' };
    if (!Array.isArray(items) || items.length === 0) return { success: false, message: 'El pedido no tiene productos' };

    const store = await Chatbot.findOne({ _id: chatbotId, pieloEnabled: true, status: 'active' }).select('_id workspaceId name');
    if (!store) return { success: false, message: 'Tienda no disponible en Pielo' };

    const normalizedItems = items.map((i) => ({
      productId:  i.productId || null,
      name:       i.name,
      quantity:   i.quantity,
      unitPrice:  i.unitPrice ?? i.unit_price ?? 0,
      totalPrice: (i.unitPrice ?? i.unit_price ?? 0) * (i.quantity || 0),
      notes:      i.notes || '',
      variant:    i.variant || '',
    }));

    const subtotal = normalizedItems.reduce((s, i) => s + i.totalPrice, 0);
    const dCost = deliveryCost || 0;
    const total = subtotal + dCost;

    const order = await PieloOrder.create({
      pieloUserId:     pieloUser._id,
      chatbotId:       store._id,
      workspaceId:     store.workspaceId,
      items:           normalizedItems,
      subtotal,
      deliveryCost:    dCost,
      total,
      customerName:    pieloUser.name,
      customerPhone:   pieloUser.phone || '',
      deliveryAddress: deliveryAddress || '',
      notes:           notes || '',
      status:          'new',
    });

    return { success: true, message: 'Pedido creado', data: { order } };
  };

  getActive = async (pieloUserId) => {
    const order = await PieloOrder.findOne({
      pieloUserId,
      status: { $in: ['new', 'preparing', 'on_the_way'] },
    }).sort({ createdAt: -1 }).populate('chatbotId', 'name widget');
    return { success: true, data: { order: order || null } };
  };

  getHistory = async (pieloUserId) => {
    const orders = await PieloOrder.find({ pieloUserId })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('chatbotId', 'name widget');
    return { success: true, data: { orders } };
  };
}

export default new PieloOrderService();
