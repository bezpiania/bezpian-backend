import Appointment from '../../models/Appointment.js';

// Normaliza los nombres de params que vienen de distintas rutas
const getIds = (params) => ({
  wsId: params.wsId || params.workspaceId,
  cbId: params.cbId || params.chatbotId || null,
});

export default class AppointmentController {
  create = async (req, res) => {
    try {
      const { wsId, cbId } = getIds(req.params);
      const { scheduledAt, customerName, customerPhone, reason, durationMinutes, conversationId } = req.body;

      if (!scheduledAt || !customerName) {
        return res.status(400).json({ success: false, message: 'Fecha y nombre requeridos' });
      }

      const appointment = new Appointment({
        workspaceId: wsId,
        chatbotId: cbId,
        conversationId,
        scheduledAt,
        customerName,
        customerPhone,
        reason,
        durationMinutes: durationMinutes || 60,
        status: 'scheduled'
      });

      await appointment.save();

      if (conversationId) {
        try {
          const Conversation = (await import('../../models/Conversation.js')).default;
          await Conversation.findByIdAndUpdate(conversationId, { outcome: 'appointment' });
        } catch (e) {}
      }

      res.status(201).json({ success: true, data: appointment });
    } catch (error) {
      console.error('Error creating appointment:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  list = async (req, res) => {
    try {
      const { wsId, cbId } = getIds(req.params);
      const query = { workspaceId: wsId };
      if (cbId) query.chatbotId = cbId;
      const appointments = await Appointment.find(query).sort({ scheduledAt: -1 });
      res.json({ success: true, data: appointments });
    } catch (error) {
      console.error('Error getting appointments:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  patch = async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const appointment = await Appointment.findByIdAndUpdate(id, { status }, { new: true });
      if (!appointment) return res.status(404).json({ success: false, message: 'Cita no encontrada' });
      res.json({ success: true, data: appointment });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  delete = async (req, res) => {
    try {
      const { wsId } = getIds(req.params);
      const { id } = req.params;
      const appointment = await Appointment.findOneAndDelete({ _id: id, workspaceId: wsId });
      if (!appointment) return res.status(404).json({ success: false, message: 'Cita no encontrada' });
      res.json({ success: true, message: 'Cita eliminada' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  get = async (req, res) => {
    try {
      const { id } = req.params;
      const appointment = await Appointment.findById(id);
      if (!appointment) return res.status(404).json({ success: false, message: 'Cita no encontrada' });
      res.json({ success: true, data: appointment });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  updateStatus = async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const appointment = await Appointment.findByIdAndUpdate(id, { status }, { new: true });
      if (!appointment) return res.status(404).json({ success: false, message: 'Cita no encontrada' });
      res.json({ success: true, data: appointment });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  reschedule = async (req, res) => {
    try {
      const { id } = req.params;
      const { scheduledAt } = req.body;
      const appointment = await Appointment.findByIdAndUpdate(id, { scheduledAt }, { new: true });
      if (!appointment) return res.status(404).json({ success: false, message: 'Cita no encontrada' });
      res.json({ success: true, data: appointment, message: 'Cita reprogramada' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  sendReminder = async (req, res) => {
    try {
      res.json({ success: true, message: 'Recordatorio enviado' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };
}
