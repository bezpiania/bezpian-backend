import mongoose from 'mongoose';

/**
 * ØpiaOrder — pedido del marketplace Øpia.
 * Referencia los tres actores: consumidor (øpiaUserId), tienda (chatbotId)
 * y repartidor (riderId, fase posterior). La tienda son los Chatbot existentes.
 */
const øpiaOrderItemSchema = new mongoose.Schema({
  productId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name:       { type: String, required: true },
  quantity:   { type: Number, required: true, min: 1 },
  unitPrice:  { type: Number, required: true },
  totalPrice: { type: Number, required: true },
  notes:      { type: String, default: '' },
  variant:    { type: String, default: '' },
}, { _id: false });

const øpiaOrderSchema = new mongoose.Schema({
  orderNumber:     { type: Number },

  øpiaUserId:     { type: mongoose.Schema.Types.ObjectId, ref: 'ØpiaUser', required: true },
  chatbotId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Chatbot', required: true },  // la tienda
  workspaceId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' },                 // dueño de la tienda
  riderId:         { type: mongoose.Schema.Types.ObjectId, ref: 'ØpiaRider', default: null },  // repartidor (futuro)
  orderId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },        // pedido espejo en el dashboard del restaurante

  items:           { type: [øpiaOrderItemSchema], default: [] },
  subtotal:        { type: Number, required: true },
  deliveryCost:    { type: Number, default: 0 },
  total:           { type: Number, required: true },

  customerName:    { type: String, default: '' },
  customerPhone:   { type: String, default: '' },
  deliveryAddress: { type: String, default: '' },
  notes:           { type: String, default: '' },

  status: {
    type: String,
    enum: ['new', 'preparing', 'on_the_way', 'delivered', 'cancelled'],
    default: 'new',
  },

  createdAt:       { type: Date, default: Date.now },
});

// Número de pedido autoincremental global del marketplace
øpiaOrderSchema.pre('save', async function () {
  if (this.isNew) {
    const last = await this.constructor.findOne().sort({ orderNumber: -1 }).select('orderNumber');
    this.orderNumber = (last?.orderNumber || 0) + 1;
  }
});

øpiaOrderSchema.index({ øpiaUserId: 1, createdAt: -1 });
øpiaOrderSchema.index({ chatbotId: 1, status: 1 });

export default mongoose.model('ØpiaOrder', øpiaOrderSchema);
