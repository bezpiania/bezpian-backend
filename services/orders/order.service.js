import Order from '../../models/Order.js';
import stockService from '../stock/stock.service.js';

export default class OrderService {

    list = async (workspaceId, chatbotId, filters = {}) => {
        try {
            const query = { workspaceId };
            if (chatbotId) query.chatbotId = chatbotId;
            if (filters.status) query.status = filters.status;
            if (filters.today) {
                const start = new Date(); start.setHours(0, 0, 0, 0);
                const end   = new Date(); end.setHours(23, 59, 59, 999);
                query.createdAt = { $gte: start, $lte: end };
            }
            const orders = await Order.find(query).sort({ createdAt: -1 });
            return { success: true, data: { orders } };
        } catch (error) {
            return { success: false, message: error.message };
        }
    };

    get = async (workspaceId, id) => {
        try {
            const order = await Order.findOne({ _id: id, workspaceId });
            if (!order) return { success: false, message: 'Pedido no encontrado' };
            return { success: true, data: { order } };
        } catch (error) {
            return { success: false, message: error.message };
        }
    };

    updateStatus = async (workspaceId, id, status, extra = {}) => {
        try {
            const update = { status, ...extra };
            const order = await Order.findOneAndUpdate(
                { _id: id, workspaceId },
                update,
                { new: true }
            );
            if (!order) return { success: false, message: 'Pedido no encontrado' };

            // Restore stock if order is cancelled (store only)
            if (status === 'cancelled' && order.items?.length) {
                setImmediate(() => stockService.restoreOrderStock(order.items));
            }

            return { success: true, data: { order } };
        } catch (error) {
            return { success: false, message: error.message };
        }
    };

    create = async (data) => {
        try {
            const order = await Order.create(data);
            return { success: true, data: { order } };
        } catch (error) {
            return { success: false, message: error.message };
        }
    };
}
