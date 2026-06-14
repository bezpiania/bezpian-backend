import mongoose from 'mongoose';

const workspaceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  industry: String,
  country: String,
  logo: String,
  brandColor: String,
  plan: { type: String, enum: ['free', 'basico', 'pro', 'enterprise'], default: 'free' },
  subscriptionId: mongoose.Schema.Types.ObjectId,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

workspaceSchema.index({ slug: 1 });
workspaceSchema.index({ ownerId: 1 });

export default mongoose.model('Workspace', workspaceSchema);
