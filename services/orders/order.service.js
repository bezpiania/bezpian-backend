import Order from '../../models/Order.js';

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

    updateStatus = async (workspaceId, id, status) => {
        try {
            const order = await Order.findOneAndUpdate(
                { _id: id, workspaceId },
                { status },
                { new: true }
            );
            if (!order) return { success: false, message: 'Pedido no encontrado' };
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
