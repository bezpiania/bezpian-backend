import logger from '../utils/logger.js';
import emailService from '../services/notifications/email.service.js';

// Throttle de alertas: máximo 1 email por firma de error cada 10 min (evita spam)
const lastAlert = new Map();
const ALERT_WINDOW_MS = 10 * 60 * 1000;

const maybeAlert = (err, req) => {
  try {
    const key = `${req.method} ${req.path} :: ${err?.message || 'unknown'}`.slice(0, 200);
    const now = Date.now();
    if (lastAlert.has(key) && now - lastAlert.get(key) < ALERT_WINDOW_MS) return;
    lastAlert.set(key, now);
    emailService.notifyAdmin(
      `🚨 Error en producción: ${req.method} ${req.path}`,
      `<h3>Error en producción</h3>
       <p><strong>Ruta:</strong> ${req.method} ${req.originalUrl}</p>
       <p><strong>Mensaje:</strong> ${err?.message || 'desconocido'}</p>
       <pre style="background:#f5f5f5;padding:12px;border-radius:6px;font-size:12px;overflow:auto">${(err?.stack || '').slice(0, 1500)}</pre>
       <p style="color:#888;font-size:12px">${new Date().toISOString()}</p>`
    ).catch(() => {});
  } catch (_) {}
};

/** 404 — ruta no encontrada. */
export const notFound = (req, res) => {
  res.status(404).json({ success: false, message: 'Recurso no encontrado' });
};

/** Manejador global de errores. Loguea siempre y alerta en 5xx. */
export const errorHandler = (err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  logger.error('Unhandled request error', {
    method: req.method,
    path: req.originalUrl,
    status,
    message: err?.message,
    stack: err?.stack,
  });
  if (status >= 500) maybeAlert(err, req);
  if (res.headersSent) return next(err);
  res.status(status).json({
    success: false,
    message: status >= 500 ? 'Error interno del servidor' : (err.message || 'Error'),
  });
};
