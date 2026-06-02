import mongoose from 'mongoose';
import crypto from 'crypto';

const workspaceInvitationSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  email:       { type: String, required: true, lowercase: true, trim: true },
  role:        { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
  token:       { type: String, required: true, unique: true },
  invitedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status:      { type: String, enum: ['pending', 'accepted', 'expired'], default: 'pending' },
  expiresAt:   { type: Date, required: true },
  createdAt:   { type: Date, default: Date.now },
});

workspaceInvitationSchema.index({ token: 1 });
workspaceInvitationSchema.index({ workspaceId: 1, email: 1 });

workspaceInvitationSchema.statics.generateToken = () => crypto.randomBytes(32).toString('hex');

export default mongoose.model('WorkspaceInvitation', workspaceInvitationSchema);
