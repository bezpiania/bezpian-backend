import jwt from 'jsonwebtoken';
import { ØpiaUser } from '../../models/øpia/index.js';

/**
 * Auth de consumidores Øpia. Verifica el JWT (mismo JWT_SECRET) pero exige
 * un token de Øpia (payload con øpiaUserId) y carga el ØpiaUser.
 * Un token de Øpia no resuelve aquí → aislamiento entre dominios.
 */
export const øpiaAuthMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'Token no proporcionado' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded?.øpiaUserId) {
      return res.status(401).json({ success: false, message: 'Token no válido para Øpia' });
    }

    const user = await ØpiaUser.findById(decoded.øpiaUserId).select('-passwordHash');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Usuario no encontrado' });
    }

    req.øpiaUser = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token inválido o expirado' });
  }
};
