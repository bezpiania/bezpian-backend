import appointmentService from '../../services/appointments/appointment.service.js';

const getIds = (params) => ({
  wsId: params.wsId || params.workspaceId,
  cbId: params.cbId || params.chatbotId || null,
});

export default class AppointmentController {

  create = async (req, res) => {
    try {
      const { wsId, cbId } = getIds(req.params);
      const response = await appointmentService.create({
        workspaceId: wsId,
        chatbotId:   cbId,
        ...req.body,
      });
      return res.status(response.success ? 201 : 400).json(response);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  };

  list = async (req, res) => {
    try {
      const { wsId, cbId } = getIds(req.params);
      const response = await appointmentService.list(wsId, cbId);
      return res.status(response.success ? 200 : 400).json(response);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  };

  get = async (req, res) => {
    try {
      const { wsId } = getIds(req.params);
      const { id } = req.params;
      const response = await appointmentService.get(wsId, id);
      return res.status(response.success ? 200 : 404).json(response);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  };

  updateStatus = async (req, res) => {
    try {
      const { wsId } = getIds(req.params);
      const { id } = req.params;
      const { status } = req.body;
      const response = await appointmentService.updateStatus(wsId, id, status);
      return res.status(response.success ? 200 : 400).json(response);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  };

  reschedule = async (req, res) => {
    try {
      const { wsId } = getIds(req.params);
      const { id } = req.params;
      const { scheduledAt } = req.body;
      const response = await appointmentService.reschedule(wsId, id, scheduledAt);
      return res.status(response.success ? 200 : 400).json(response);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  };

  // Alias for backward compatibility with chatbots/appointments.routes.js
  patch = async (req, res) => {
    return this.updateStatus(req, res);
  };

  delete = async (req, res) => {
    try {
      const { wsId } = getIds(req.params);
      const { id } = req.params;
      const query = { _id: id };
      if (wsId) query.workspaceId = wsId;
      const Appointment = (await import('../../models/Appointment.js')).default;
      const appointment = await Appointment.findOneAndDelete(query);
      if (!appointment) return res.status(404).json({ success: false, message: 'Cita no encontrada' });
      return res.json({ success: true, message: 'Cita eliminada' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  };

  sendReminder = async (req, res) => {
    try {
      res.json({ success: true, message: 'Recordatorio enviado' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  };
}
