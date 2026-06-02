import mongoose from 'mongoose';

const quoteSchema = new mongoose.Schema({
  chatbotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chatbot', required: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  quoteNumber: { type: String, required: true, unique: true },

  items: [{
    productId: String,
    name: String,
    quantity: Number,
    unitPrice: Number,
    subtotal: Number
  }],

  subtotal: Number,
  tax: Number,
  total: Number,
  currency: { type: String, default: 'CLP' },

  customerData: mongoose.Schema.Types.Mixed,

  pdfUrl: String,
  shareToken: String,
  status: { type: String, enum: ['draft', 'sent', 'accepted', 'rejected', 'expired'], default: 'draft' },
  expiresAt: Date,

  // Lifecycle tracking
  sentAt: Date,
  viewedAt: Date,
  acceptedAt: Date,
  viewCount: { type: Number, default: 0 },

  // Cached company info at quote time
  companySummary: {
    name: String,
    email: String,
    phone: String,
    address: String,
    website: String
  },

  createdAt: { type: Date, default: Date.now }
});

quoteSchema.index({ workspaceId: 1, createdAt: -1 });
quoteSchema.index({ quoteNumber: 1 }, { unique: true });
quoteSchema.index({ shareToken: 1 });

export default mongoose.model('Quote', quoteSchema);
