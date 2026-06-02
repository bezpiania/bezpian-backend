import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name:        { type: String, required: true },
  quantity:    { type: Number, required: true, min: 1 },
  unitPrice:   { type: Number, required: true },
  totalPrice:  { type: Number, required: true },
  notes:       { type: String },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  chatbotId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Chatbot', required: true },
  workspaceId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  conversationId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },

  // Order number (auto-incremented per workspace)
  orderNumber:     { type: Number },

  // Items
  items:           { type: [orderItemSchema], required: true },
  subtotal:        { type: Number, required: true },
  deliveryCost:    { type: Number, default: 0 },
  total:           { type: Number, required: true },

  // Customer
  customerName:    { type: String, required: true },
  customerPhone:   { type: String },
  customerEmail:   { type: String },

  // Delivery
  deliveryAddress: { type: String, required: true },
  deliveryZone:    { type: String },
  estimatedMinutes:{ type: Number },

  notes:           { type: String },

  status: {
    type: String,
    enum: ['new', 'preparing', 'on_the_way', 'delivered', 'cancelled'],
    default: 'new',
  },
}, { timestamps: true });

orderSchema.index({ workspaceId: 1, createdAt: -1 });
orderSchema.index({ chatbotId: 1, status: 1 });

// Auto-increment orderNumber per workspace
orderSchema.pre('save', async function () {
  if (this.isNew) {
    const last = await this.constructor.findOne({ workspaceId: this.workspaceId }).sort({ orderNumber: -1 });
    this.orderNumber = (last?.orderNumber || 0) + 1;
  }
});

export default mongoose.model('Order', orderSchema);
