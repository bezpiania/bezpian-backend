import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  chatbotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chatbot', required: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  visitorId: String,

  visitorMetadata: {
    name: String,
    email: String,
    phone: String,
    userAgent: String,
    ipCountry: String,
    referrerUrl: String
  },

  status: { type: String, enum: ['active', 'closed', 'spam'], default: 'active' },
  outcome: { type: String, enum: ['lead', 'appointment', 'quote', 'none'], default: 'none' },
  messageCount: { type: Number, default: 0 },
  startedAt: { type: Date, default: Date.now },
  lastMessageAt: { type: Date, default: Date.now },
  closedAt: Date,

  // Información de lead en progreso (mientras se completa)
  leadInfo: {
    name: String,
    email: String,
    phone: String,
    company: String,
    updatedAt: Date
  },

  // Slots de reserva en progreso — guardados al primer intento válido para no perderlos
  pendingBookingSlots: {
    date:            String,   // YYYY-MM-DD
    time:            String,   // HH:MM
    guestCount:      Number,
    savedAt:         Date,
    collectedFields: { type: mongoose.Schema.Types.Mixed, default: {} }
  }
});

conversationSchema.index({ chatbotId: 1, lastMessageAt: -1 });
conversationSchema.index({ visitorId: 1 });
conversationSchema.index({ workspaceId: 1, status: 1 });

export default mongoose.model('Conversation', conversationSchema);
