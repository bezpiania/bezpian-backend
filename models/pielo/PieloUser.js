import mongoose from 'mongoose';

/**
 * ØpiaUser — consumidor del marketplace Øpia.
 * Auth independiente de los usuarios de Øpia (dueños de negocio).
 * El hashing de password se hace en øpia-auth.service (como en User.js).
 */
const øpiaAddressSchema = new mongoose.Schema({
  label:   { type: String, default: 'Casa' },
  address: { type: String, required: true },
  notes:   { type: String, default: '' },
}, { _id: true });

const øpiaUserSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, default: null },
  phone:        { type: String, default: '' },
  addresses:    { type: [øpiaAddressSchema], default: [] },
  lastLoginAt:  { type: Date, default: null },
  createdAt:    { type: Date, default: Date.now },
});

øpiaUserSchema.index({ email: 1 });

export default mongoose.model('ØpiaUser', øpiaUserSchema);
