import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  plan: { type: String, enum: ['free', 'basico', 'pro', 'enterprise'], required: true },
  status: { type: String, enum: ['trialing', 'active', 'past_due', 'cancelling', 'ended'], default: 'active' },
  trialEndsAt: Date,
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  cancelledAt: Date,
  mercadoPagoSubscriptionId: String,
  amount: Number,
  currency: { type: String, default: 'CLP' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

subscriptionSchema.index({ workspaceId: 1 });
subscriptionSchema.index({ mercadoPagoSubscriptionId: 1 });

export default mongoose.model('Subscription', subscriptionSchema);
