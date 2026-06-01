import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema({
  chatbotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chatbot', required: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  resourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource' },
  guestCount: { type: Number, default: 1, min: 1 },
  scheduledAt: { type: Date, required: true },
  durationMinutes: Number,
  reason: String,
  customerName: String,
  customerEmail: String,
  customerPhone: String,
  notes: String,
  status: { type: String, enum: ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'], default: 'scheduled' },
  calendarEventId: String,
  calendarEventUrl: String,
  reminderSent: { type: Boolean, default: false },
  externalId: String,
  createdAt: { type: Date, default: Date.now }
});

appointmentSchema.index({ workspaceId: 1, scheduledAt: 1 });
appointmentSchema.index({ chatbotId: 1, status: 1 });

// Virtual field: startTime (para compatibilidad con frontend)
appointmentSchema.virtual('startTime').get(function() {
  return this.scheduledAt;
});

// Virtual field: endTime (calculado desde scheduledAt + durationMinutes)
appointmentSchema.virtual('endTime').get(function() {
  if (!this.scheduledAt || !this.durationMinutes) return null;
  return new Date(this.scheduledAt.getTime() + this.durationMinutes * 60000);
});

// Virtual field: clientName (alias para customerName)
appointmentSchema.virtual('clientName').get(function() {
  return this.customerName;
});

// Configurar serialización para incluir virtuals
appointmentSchema.set('toJSON', { virtuals: true });
appointmentSchema.set('toObject', { virtuals: true });

export default mongoose.model('Appointment', appointmentSchema);
