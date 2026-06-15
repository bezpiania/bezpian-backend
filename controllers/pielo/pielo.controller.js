import pieloAuthService from '../../services/pielo/pielo-auth.service.js';
import pieloConciergeService from '../../services/pielo/pielo-concierge.service.js';
import pieloOrderService from '../../services/pielo/pielo-order.service.js';

/**
 * Controller único del módulo Pielo (auth + concierge + pedidos).
 */
export default class PieloController {
  // ── Auth ──
  register = async (req, res) => {
    try {
      const r = await pieloAuthService.register(req.body);
      return res.status(r.success ? 201 : 400).json(r);
    } catch (e) {
      return res.status(500).json({ success: false, message: 'Error al registrar' });
    }
  };

  login = async (req, res) => {
    try {
      const r = await pieloAuthService.login(req.body);
      return res.status(r.success ? 200 : 401).json(r);
    } catch (e) {
      return res.status(500).json({ success: false, message: 'Error al iniciar sesión' });
    }
  };

  me = async (req, res) => {
    return res.status(200).json({ success: true, data: { user: req.pieloUser } });
  };

  // ── Concierge ──
  restaurants = async (req, res) => {
    try {
      const data = await pieloConciergeService.getRestaurants();
      return res.status(200).json({ success: true, data: { restaurants: data } });
    } catch (e) {
      return res.status(500).json({ success: false, message: 'Error al listar restaurantes' });
    }
  };

  discovery = async (req, res) => {
    try {
      const data = await pieloConciergeService.getDiscovery();
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return res.status(500).json({ success: false, message: 'Error al cargar destacados' });
    }
  };

  chat = async (req, res) => {
    try {
      const r = await pieloConciergeService.chat(req.body?.message);
      return res.status(200).json(r);
    } catch (e) {
      return res.status(500).json({ success: false, message: 'Error en el concierge' });
    }
  };

  // ── Pedidos ──
  createOrder = async (req, res) => {
    try {
      const r = await pieloOrderService.create(req.pieloUser, req.body);
      return res.status(r.success ? 201 : 400).json(r);
    } catch (e) {
      return res.status(500).json({ success: false, message: 'Error al crear pedido' });
    }
  };

  activeOrder = async (req, res) => {
    try {
      const r = await pieloOrderService.getActive(req.pieloUser._id);
      return res.status(200).json(r);
    } catch (e) {
      return res.status(500).json({ success: false, message: 'Error al obtener pedido' });
    }
  };

  orderHistory = async (req, res) => {
    try {
      const r = await pieloOrderService.getHistory(req.pieloUser._id);
      return res.status(200).json(r);
    } catch (e) {
      return res.status(500).json({ success: false, message: 'Error al obtener historial' });
    }
  };
}
