import Chatbot from '../../models/Chatbot.js';
import Order from '../../models/Order.js';
import { ØpiaOrder } from '../../models/øpia/index.js';

/**
 * Pedidos del marketplace Øpia. Crea pedidos contra una tienda (Chatbot)
 * y los consulta por consumidor.
 */
class ØpiaOrderService {
  create = async (øpiaUser, payload) => {
    const { chatbotId, items, deliveryAddress, notes, deliveryCost } = payload || {};

    if (!chatbotId) return { success: false, message: 'Falta la tienda (chatbotId)' };
    if (!Array.isArray(items) || items.length === 0) return { success: false, message: 'El pedido no tiene productos' };

    const store = await Chatbot.findOne({ _id: chatbotId, øpiaEnabled: true, status: 'active' }).select('_id workspaceId name');
    if (!store) return { success: false, message: 'Tienda no disponible en Øpia' };

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

    // 1) Pedido del marketplace (vista del consumidor + tracking/repartidor)
    const øpiaOrder = await ØpiaOrder.create({
      øpiaUserId:     øpiaUser._id,
      chatbotId:       store._id,
      workspaceId:     store.workspaceId,
      items:           normalizedItems,
      subtotal,
      deliveryCost:    dCost,
      total,
      customerName:    øpiaUser.name,
      customerPhone:   øpiaUser.phone || '',
      deliveryAddress: deliveryAddress || '',
      notes:           notes || '',
      status:          'new',
    });

    // 2) Pedido espejo en Øpia → aparece en el panel Ventas del restaurante
    try {
      const mirror = await Order.create({
        chatbotId:       store._id,
        workspaceId:     store.workspaceId,
        items:           normalizedItems,
        subtotal,
        deliveryCost:    dCost,
        total,
        customerName:    øpiaUser.name,
        customerPhone:   øpiaUser.phone || '',
        deliveryAddress: deliveryAddress || '',
        notes:           notes || '',
        orderType:       'delivery',
        status:          'new',
        source:          'øpia',
        øpiaOrderId:    øpiaOrder._id,
      });
      øpiaOrder.orderId = mirror._id;
      await øpiaOrder.save();
      await Chatbot.updateOne({ _id: store._id }, { $inc: { 'stats.totalOrders': 1 } }).catch(() => {});
    } catch (e) {
      // si falla el espejo, el pedido de Øpia igual queda registrado
    }

    return { success: true, message: 'Pedido creado', data: { order: øpiaOrder } };
  };

  getActive = async (øpiaUserId) => {
    const order = await ØpiaOrder.findOne({
      øpiaUserId,
      status: { $in: ['new', 'preparing', 'on_the_way'] },
    }).sort({ createdAt: -1 }).populate('chatbotId', 'name widget');
    return { success: true, data: { order: order || null } };
  };

  getHistory = async (øpiaUserId) => {
    const orders = await ØpiaOrder.find({ øpiaUserId })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('chatbotId', 'name widget');
    return { success: true, data: { orders } };
  };
}

export default new ØpiaOrderService();
