import mongoose from 'mongoose';

/**
 * PieloUser — consumidor del marketplace Pielo.
 * Auth independiente de los usuarios de Pielo (dueños de negocio).
 * El hashing de password se hace en pielo-auth.service (como en User.js).
 */
const pieloAddressSchema = new mongoose.Schema({
  label:   { type: String, default: 'Casa' },
  address: { type: String, required: true },
  notes:   { type: String, default: '' },
}, { _id: true });

const pieloUserSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, default: null },
  phone:        { type: String, default: '' },
  addresses:    { type: [pieloAddressSchema], default: [] },
  lastLoginAt:  { type: Date, default: null },
  createdAt:    { type: Date, default: Date.now },
});

pieloUserSchema.index({ email: 1 });

export default mongoose.model('PieloUser', pieloUserSchema);
