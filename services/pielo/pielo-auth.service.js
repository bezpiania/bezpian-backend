import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PieloUser } from '../../models/pielo/index.js';

/**
 * Auth de consumidores Pielo. Independiente del AuthService de Pielo.
 * Token JWT con payload { pieloUserId } para diferenciarlo de los de negocio.
 */
class PieloAuthService {
  _sign(user) {
    return jwt.sign({ pieloUserId: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
  }

  _publicUser(user) {
    return { id: user._id, name: user.name, email: user.email, phone: user.phone, addresses: user.addresses };
  }

  register = async ({ name, email, password, phone }) => {
    if (!name || !email || !password) {
      return { success: false, message: 'Nombre, email y contraseña son obligatorios' };
    }
    const existing = await PieloUser.findOne({ email: email.toLowerCase() });
    if (existing) {
      return { success: false, message: 'Ya existe una cuenta con ese email' };
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await PieloUser.create({ name, email: email.toLowerCase(), passwordHash, phone: phone || '' });
    return { success: true, message: 'Cuenta creada', data: { accessToken: this._sign(user), user: this._publicUser(user) } };
  };

  login = async ({ email, password }) => {
    if (!email || !password) {
      return { success: false, message: 'Email y contraseña son obligatorios' };
    }
    const user = await PieloUser.findOne({ email: email.toLowerCase() });
    if (!user || !user.passwordHash) {
      return { success: false, message: 'Credenciales inválidas' };
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return { success: false, message: 'Credenciales inválidas' };
    }
    user.lastLoginAt = new Date();
    await user.save();
    return { success: true, message: 'Login exitoso', data: { accessToken: this._sign(user), user: this._publicUser(user) } };
  };
}

export default new PieloAuthService();
