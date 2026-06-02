import BillingService from '../../services/billing/billing.service.js';
import { validateRequired, validateMongoId } from '../../middlewares/validation.middleware.js';

const billingService = new BillingService();

export default class BillingController {
    getUsage = async (req, res) => {
        try {
            const workspaceId = req.query.workspaceId;
            if (!workspaceId) return res.status(400).json({ success: false, message: 'workspaceId requerido' });
            const response = await billingService.getUsage(workspaceId);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ BillingController.getUsage:', error);
            return res.status(500).json({ success: false, message: 'Error al obtener uso' });
        }
    };

    listPlans = async (req, res) => {
        try {
            const response = await billingService.listPlans();
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ BillingController.listPlans:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al listar planes'
            });
        }
    };

    getSubscription = async (req, res) => {
        try {
            const { workspaceId } = req.params;

            if (!validateMongoId(workspaceId)) {
                return res.status(400).json({
                    success: false,
                    message: 'ID de workspace inválido'
                });
            }

            const response = await billingService.getSubscription(workspaceId);
            return res.status(response.success ? 200 : 404).json(response);
        } catch (error) {
            console.error('❌ BillingController.getSubscription:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al obtener suscripción'
            });
        }
    };

    subscribe = async (req, res) => {
        try {
            const { workspaceId } = req.params;
            const { planId } = req.body;

            if (!validateMongoId(workspaceId)) {
                return res.status(400).json({
                    success: false,
                    message: 'ID de workspace inválido'
                });
            }

            const missing = validateRequired(['planId'], { planId });
            if (missing) {
                return res.status(400).json({
                    success: false,
                    message: `Campos requeridos: ${missing.join(', ')}`
                });
            }

            const response = await billingService.subscribe(workspaceId, planId);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ BillingController.subscribe:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al suscribirse'
            });
        }
    };

    changePlan = async (req, res) => {
        try {
            const { workspaceId } = req.params;
            const { planId } = req.body;

            if (!validateMongoId(workspaceId)) {
                return res.status(400).json({
                    success: false,
                    message: 'ID de workspace inválido'
                });
            }

            const missing = validateRequired(['planId'], { planId });
            if (missing) {
                return res.status(400).json({
                    success: false,
                    message: `Campos requeridos: ${missing.join(', ')}`
                });
            }

            const response = await billingService.changePlan(workspaceId, planId);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ BillingController.changePlan:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al cambiar plan'
            });
        }
    };

    cancel = async (req, res) => {
        try {
            const { workspaceId } = req.params;
            const response = await billingService.cancel(workspaceId);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ BillingController.cancel:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al cancelar suscripción'
            });
        }
    };

    listPayments = async (req, res) => {
        try {
            const { workspaceId } = req.params;
            const response = await billingService.listPayments(workspaceId);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ BillingController.listPayments:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al listar pagos'
            });
        }
    };

    getInvoice = async (req, res) => {
        try {
            const { id } = req.params;
            const response = await billingService.getInvoice(id);
            return res.status(response.success ? 200 : 404).json(response);
        } catch (error) {
            console.error('❌ BillingController.getInvoice:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al obtener factura'
            });
        }
    };
}
