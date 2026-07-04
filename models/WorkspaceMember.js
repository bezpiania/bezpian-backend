import mongoose from 'mongoose';

const workspaceMemberSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['owner', 'admin', 'member', 'client'], default: 'member' },
  // Para role 'client' (cliente final del plan Empresa): queda restringido a UN solo bot.
  scopedChatbotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chatbot', default: null },
  status: { type: String, enum: ['invited', 'active', 'removed'], default: 'active' },
  invitedBy: mongoose.Schema.Types.ObjectId,
  invitedAt: Date,
  joinedAt: Date,
  createdAt: { type: Date, default: Date.now }
});

workspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
workspaceMemberSchema.index({ userId: 1 });

export default mongoose.model('WorkspaceMember', workspaceMemberSchema);
