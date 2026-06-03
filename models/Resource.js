import mongoose from 'mongoose';
import crypto from 'crypto';

const timeSlotSchema = new mongoose.Schema({
  time: { type: String, required: true }, // "13:00"
}, { _id: false });

const dayScheduleSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  slots: [timeSlotSchema],
}, { _id: false });

const resourceSchema = new mongoose.Schema({
  chatbotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chatbot', required: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ['table', 'person', 'room', 'equipment'],
    default: 'table',
  },
  capacity:           { type: Number, default: 1, min: 1 },
  isClientSelectable: { type: Boolean, default: false },
  description:        { type: String, trim: true },
  durationMinutes:    { type: Number, default: 60, min: 15 },
  bufferMinutes:      { type: Number, default: 0, min: 0 },

  // QR / table ordering
  tableToken:   { type: String, unique: true, sparse: true }, // unique token for QR URL

  // RESTAURANT — zone type (terraza, interior, barra)
  zoneType:     { type: String, enum: ['interior', 'terraza', 'barra', 'privado', 'any'], default: 'any' },

  // CLINIC — specialties this resource covers
  specialties:  [{ type: String }],

  // Blocked dates/times (doctor on vacation, etc.)
  blockedDates: [{
    _id: false,
    date:   { type: String },           // YYYY-MM-DD or range
    reason: { type: String },
  }],
  schedule: {
    mon: { type: dayScheduleSchema, default: () => ({ enabled: false, slots: [] }) },
    tue: { type: dayScheduleSchema, default: () => ({ enabled: false, slots: [] }) },
    wed: { type: dayScheduleSchema, default: () => ({ enabled: false, slots: [] }) },
    thu: { type: dayScheduleSchema, default: () => ({ enabled: false, slots: [] }) },
    fri: { type: dayScheduleSchema, default: () => ({ enabled: false, slots: [] }) },
    sat: { type: dayScheduleSchema, default: () => ({ enabled: false, slots: [] }) },
    sun: { type: dayScheduleSchema, default: () => ({ enabled: false, slots: [] }) },
  },
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
});

resourceSchema.index({ chatbotId: 1, isActive: 1 });
resourceSchema.index({ workspaceId: 1 });
resourceSchema.index({ tableToken: 1 }, { sparse: true });

// Auto-generate tableToken for tables
resourceSchema.pre('save', function () {
  if (this.isNew && (this.type === 'table' || this.type === 'room') && !this.tableToken) {
    this.tableToken = crypto.randomBytes(12).toString('hex');
  }
});

export default mongoose.model('Resource', resourceSchema);
