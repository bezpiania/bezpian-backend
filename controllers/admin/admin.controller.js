import adminService from '../../services/admin/admin.service.js';

export default class AdminController {

    generateEmbeddings = async (req, res) => {
        try {
            const { chatbotId } = req.params;
            const response = await adminService.generateEmbeddings(chatbotId);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    };
}
