import mongoose from 'mongoose';

const chatbotConfigSchema = new mongoose.Schema(
  {
    chatbotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chatbot',
      required: true,
      unique: true,
    },
    instructions: {
      // Identity
      assistantName:  { type: String, default: '' },      // e.g. "Rafi" — if empty, uses bot name
      tone: {
        type: String,
        enum: ['amigable', 'profesional', 'casual', 'formal'],
        default: 'amigable',
      },
      language: {
        type: String,
        enum: ['es', 'en', 'auto'],
        default: 'auto',                                  // auto = respond in client's language
      },

      // Messages
      welcomeMessage:  { type: String, default: '' },
      fallbackMessage: { type: String, default: '' },
      closingQuestion: { type: String, default: '¿En qué más puedo ayudarte?' },

      // Rules — structured as list items, not free text
      customRules:   [{ type: String }],                  // things the bot SHOULD do
      restrictions:  [{ type: String }],                  // things the bot should NOT do

      // Legacy fields kept for backward compat
      maxProducts: { type: Number, default: 5 },
    },
  },
  { timestamps: true }
);

export default mongoose.model('ChatbotConfig', chatbotConfigSchema);
