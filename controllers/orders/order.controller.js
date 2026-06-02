import OrderService from '../../services/orders/order.service.js';

const orderService = new OrderService();

export default class OrderController {

    list = async (req, res) => {
        try {
            const { workspaceId, chatbotId } = req.params;
            const { status, today } = req.query;
            const response = await orderService.list(workspaceId, chatbotId, { status, today });
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    };

    get = async (req, res) => {
        try {
            const { workspaceId, id } = req.params;
            const response = await orderService.get(workspaceId, id);
            return res.status(response.success ? 200 : 404).json(response);
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    };

    updateStatus = async (req, res) => {
        try {
            const { workspaceId, id } = req.params;
            const { status } = req.body;
            const response = await orderService.updateStatus(workspaceId, id, status);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    };
}
