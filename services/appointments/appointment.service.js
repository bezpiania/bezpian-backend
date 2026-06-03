import Appointment from '../../models/Appointment.js';
import Chatbot from '../../models/Chatbot.js';
import calendarService from '../calendar/calendar.service.js';

class AppointmentService {
  /**
   * Valida si un slot está disponible según config del chatbot
   * Verifica: horarios de atención, días de trabajo, sin conflictos, buffer entre citas
   */
  async isSlotAvailable(chatbotId, scheduledAt, durationMinutes = 30) {
    try {
      // Obtener config del chatbot
      const chatbot = await Chatbot.findById(chatbotId);
      if (!chatbot) {
        return { available: false, reason: 'Chatbot no encontrado' };
      }

      const config = chatbot.integrations?.calendar || {};
      const bookingHoursStart = config.bookingHoursStart || '09:00';
      const bookingHoursEnd = config.bookingHoursEnd || '18:00';
      const bookingDays = config.bookingDays || [1, 2, 3, 4, 5];
      const bufferMinutes = config.bufferMinutes || 0;
      const maxDaysInAdvance = config.maxDaysInAdvance || 30;

      const slotDate = new Date(scheduledAt);
      const slotEndDate = new Date(slotDate.getTime() + durationMinutes * 60000);
      const now = new Date();

      // Validar: no en el pasado
      if (slotDate <= now) {
        return { available: false, reason: 'La fecha no puede ser en el pasado' };
      }

      // Validar: no más allá de maxDaysInAdvance
      const maxDate = new Date(now.getTime() + maxDaysInAdvance * 24 * 60 * 60 * 1000);
      if (slotDate > maxDate) {
        return { available: false, reason: `No se pueden agendar citas más de ${maxDaysInAdvance} días en avance` };
      }

      // Validar: día de la semana (bookingDays)
      const dayOfWeek = slotDate.getDay();
      if (!bookingDays.includes(dayOfWeek)) {
        const dayNames = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
        return { available: false, reason: `No atendemos los ${dayNames[dayOfWeek]}` };
      }

      // Validar: horario de agendamiento
      const [startHour, startMin] = bookingHoursStart.split(':').map(Number);
      const [endHour, endMin] = bookingHoursEnd.split(':').map(Number);
      const slotHour = slotDate.getHours() + slotDate.getMinutes() / 60;
      const slotEndHour = slotEndDate.getHours() + slotEndDate.getMinutes() / 60;
      const bookingStart = startHour + startMin / 60;
      const bookingEnd = endHour + endMin / 60;

      if (slotHour < bookingStart || slotEndHour > bookingEnd) {
        return { available: false, reason: `Nuestros horarios para agendar son ${bookingHoursStart}-${bookingHoursEnd}` };
      }

      // Validar: sin conflictos con citas existentes (incluyendo buffer)
      const bufferStart = new Date(slotDate.getTime() - bufferMinutes * 60000);
      const bufferEnd = new Date(slotEndDate.getTime() + bufferMinutes * 60000);

      const conflictingAppointment = await Appointment.findOne({
        chatbotId,
        scheduledAt: {
          $gte: bufferStart,
          $lt: bufferEnd
        },
        status: { $in: ['scheduled', 'confirmed', 'completed'] }
      });

      if (conflictingAppointment) {
        return { available: false, reason: 'Este horario no está disponible' };
      }

      return { available: true };
    } catch (error) {
      console.error('Error validating slot:', error);
      return { available: false, reason: 'Error al validar disponibilidad' };
    }
  }

  /**
   * Obtiene horarios disponibles para un chatbot
   * Retorna bloques de durationMinutes respetando config (horarios, días, conflictos)
   */
  async getAvailableSlots(chatbotId, workspaceId, startDate, endDate, durationMinutes = 30) {
    try {
      const slots = [];
      const currentDate = new Date(startDate);
      const end = new Date(endDate);

      // Obtener config del chatbot
      const chatbot = await Chatbot.findById(chatbotId);
      if (!chatbot) return slots;

      const config = chatbot.integrations?.calendar || {};
      const [startHour, startMin] = (config.bookingHoursStart || '09:00').split(':').map(Number);
      const bookingDays = config.bookingDays || [1, 2, 3, 4, 5];

      // Comenzar desde el inicio del día de negocio
      currentDate.setHours(startHour, startMin, 0, 0);

      // Generar bloques respetando config del chatbot
      while (currentDate < end) {
        const dayOfWeek = currentDate.getDay();

        // Solo días de agendamiento configurados
        if (bookingDays.includes(dayOfWeek)) {
          // Validar el slot actual
          const validation = await this.isSlotAvailable(chatbotId, new Date(currentDate), durationMinutes);
          if (validation.available) {
            slots.push({
              startTime: new Date(currentDate),
              endTime: new Date(currentDate.getTime() + durationMinutes * 60000)
            });
          }
        }

        // Avanzar según durationMinutes
        currentDate.setMinutes(currentDate.getMinutes() + durationMinutes);

        // Si pasamos el fin del día de agendamiento, saltar al inicio del próximo día de agendamiento
        const [, , endHour, endMin] = (config.bookingHoursEnd || '18:00').split(':').map(Number);
        if (currentDate.getHours() >= endHour && currentDate.getMinutes() >= endMin) {
          currentDate.setDate(currentDate.getDate() + 1);
          currentDate.setHours(startHour, startMin, 0, 0);
        }
      }

      return slots;
    } catch (error) {
      console.error('Error getting available slots:', error);
      return [];
    }
  }

  /**
   * Crea una nueva cita
   */
  async createAppointment(chatbotId, workspaceId, appointmentData) {
    try {
      const appointment = new Appointment({
        chatbotId,
        workspaceId,
        ...appointmentData,
        status: 'scheduled'
      });

      await appointment.save();

      // Intentar crear evento en Google Calendar si está conectado
      try {
        const chatbot = await Chatbot.findById(chatbotId);
        if (chatbot?.integrations?.calendar?.accessToken) {
          console.log('📅 Creando evento en Google Calendar...');

          const calendarResult = await calendarService.createCalendarEvent(
            chatbotId,
            chatbot.integrations.calendar.accessToken,
            {
              customerName: appointmentData.customerName,
              customerEmail: appointmentData.customerEmail,
              customerPhone: appointmentData.customerPhone,
              reason: appointmentData.reason,
              scheduledAt: appointmentData.scheduledAt,
              durationMinutes: appointmentData.durationMinutes || 30
            }
          );

          if (calendarResult.success) {
            // Actualizar la cita con el ID del evento en Google Calendar
            await Appointment.findByIdAndUpdate(appointment._id, {
              calendarEventId: calendarResult.calendarEventId,
              calendarEventUrl: calendarResult.calendarEventUrl
            });

            console.log('✅ Evento creado en Google Calendar:', calendarResult.calendarEventId);
          } else {
            console.warn('⚠️ No se pudo crear evento en Google Calendar:', calendarResult.error);
          }
        }
      } catch (calendarError) {
        console.warn('⚠️ Error sincronizando con Google Calendar:', calendarError.message);
        // No fallar la cita si hay error con Google Calendar
      }

      return {
        success: true,
        message: 'Cita agendada exitosamente',
        data: appointment
      };
    } catch (error) {
      console.error('❌ AppointmentService.createAppointment:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Obtiene citas de un chatbot
   */
  async getAppointments(chatbotId, workspaceId, filters = {}) {
    try {
      const query = { chatbotId, workspaceId };

      if (filters.status) {
        query.status = filters.status;
      }

      if (filters.startDate && filters.endDate) {
        query.scheduledAt = {
          $gte: new Date(filters.startDate),
          $lte: new Date(filters.endDate)
        };
      }

      const appointments = await Appointment.find(query).sort({ scheduledAt: -1 });

      return {
        success: true,
        message: 'Citas obtenidas',
        data: appointments
      };
    } catch (error) {
      console.error('❌ AppointmentService.getAppointments:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Actualiza estado de una cita
   */
  async updateAppointmentStatus(appointmentId, status) {
    try {
      const appointment = await Appointment.findByIdAndUpdate(
        appointmentId,
        { status },
        { new: true }
      );

      return {
        success: true,
        message: 'Cita actualizada',
        data: appointment
      };
    } catch (error) {
      console.error('❌ AppointmentService.updateAppointmentStatus:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Cancela una cita
   */
  async cancelAppointment(appointmentId) {
    try {
      const appointment = await Appointment.findByIdAndUpdate(
        appointmentId,
        { status: 'cancelled' },
        { new: true }
      );

      return {
        success: true,
        message: 'Cita cancelada',
        data: appointment
      };
    } catch (error) {
      console.error('❌ AppointmentService.cancelAppointment:', error);
      return { success: false, message: error.message };
    }
  }

  list = async (workspaceId, chatbotId) => {
    try {
      const query = { workspaceId };
      if (chatbotId) query.chatbotId = chatbotId;
      const appointments = await Appointment.find(query).sort({ scheduledAt: -1 });
      return { success: true, data: { appointments } };
    } catch (error) {
      return { success: false, message: error.message };
    }
  };

  get = async (workspaceId, id) => {
    try {
      const query = { _id: id };
      if (workspaceId) query.workspaceId = workspaceId;
      const appointment = await Appointment.findOne(query);
      if (!appointment) return { success: false, message: 'Cita no encontrada' };
      return { success: true, data: { appointment } };
    } catch (error) {
      return { success: false, message: error.message };
    }
  };

  create = async (data) => {
    try {
      const appointment = await Appointment.create(data);
      return { success: true, data: { appointment } };
    } catch (error) {
      return { success: false, message: error.message };
    }
  };

  updateStatus = async (workspaceId, id, status) => {
    try {
      const query = { _id: id };
      if (workspaceId) query.workspaceId = workspaceId;
      const appointment = await Appointment.findOneAndUpdate(query, { status }, { new: true });
      if (!appointment) return { success: false, message: 'Cita no encontrada' };
      return { success: true, data: { appointment } };
    } catch (error) {
      return { success: false, message: error.message };
    }
  };

  reschedule = async (workspaceId, id, scheduledAt) => {
    try {
      const query = { _id: id };
      if (workspaceId) query.workspaceId = workspaceId;
      const appointment = await Appointment.findOneAndUpdate(query, { scheduledAt }, { new: true });
      if (!appointment) return { success: false, message: 'Cita no encontrada' };
      return { success: true, data: { appointment }, message: 'Cita reprogramada' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  };
}

export default new AppointmentService();
