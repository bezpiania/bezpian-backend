import jwt from 'jsonwebtoken';
import { PieloUser } from '../../models/pielo/index.js';

/**
 * Auth de consumidores Pielo. Verifica el JWT (mismo JWT_SECRET) pero exige
 * un token de Pielo (payload con pieloUserId) y carga el PieloUser.
 * Un token de Pielo no resuelve aquí → aislamiento entre dominios.
 */
export const pieloAuthMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'Token no proporcionado' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded?.pieloUserId) {
      return res.status(401).json({ success: false, message: 'Token no válido para Pielo' });
    }

    const user = await PieloUser.findById(decoded.pieloUserId).select('-passwordHash');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Usuario no encontrado' });
    }

    req.pieloUser = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token inválido o expirado' });
  }
};
