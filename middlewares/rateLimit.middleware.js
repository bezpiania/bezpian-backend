import logger from '../utils/logger.js';

const LIMITS = {
  'POST /api/embed/messages': {
    maxRequests: 30,
    timeWindow: 60000 // 1 minuto
  },
  'POST /api/embed/conversations': {
    maxRequests: 10,
    timeWindow: 60000
  },
  // Endpoints de autenticación — estrictos para frenar fuerza bruta / credential stuffing
  'POST /api/auth/login': {
    maxRequests: 10,
    timeWindow: 300000 // 5 minutos
  },
  'POST /api/auth/signup': {
    maxRequests: 5,
    timeWindow: 300000
  },
  'POST /api/auth/forgot-password': {
    maxRequests: 5,
    timeWindow: 300000
  },
  'POST /api/auth/reset-password': {
    maxRequests: 10,
    timeWindow: 300000
  },
  'POST /api/auth/resend-verification': {
    maxRequests: 5,
    timeWindow: 300000
  },
  'POST /api/auth/verify-email': {
    maxRequests: 20,
    timeWindow: 300000
  },
  'default': {
    maxRequests: 100,
    timeWindow: 60000
  }
};

class RateLimiter {
  constructor() {
    this.requests = new Map();
    this.cleanup();
  }

  /**
   * Genera clave de rate limit (por usuario/IP)
   */
  getKey(req) {
    return req.body?.botId || req.headers['x-forwarded-for'] || req.ip || 'unknown';
  }

  /**
   * Verifica si la solicitud está permitida
   */
  isAllowed(key, limit) {
    const now = Date.now();

    if (!this.requests.has(key)) {
      this.requests.set(key, []);
    }

    const timestamps = this.requests.get(key);

    // Limpiar timestamps antiguos
    const validTimestamps = timestamps.filter(t => now - t < limit.timeWindow);

    if (validTimestamps.length >= limit.maxRequests) {
      logger.rateLimit(key, 'unknown', validTimestamps.length, limit.maxRequests);
      return false;
    }

    validTimestamps.push(now);
    this.requests.set(key, validTimestamps);
    return true;
  }

  /**
   * Middleware
   */
  middleware = (req, res, next) => {
    const endpoint = `${req.method} ${req.path}`;
    const limit = LIMITS[endpoint] || LIMITS.default;
    const key = this.getKey(req);

    if (!this.isAllowed(key, limit)) {
      logger.warn(`Rate limit exceeded: ${endpoint}`, { key });
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil(limit.timeWindow / 1000)
      });
    }

    next();
  };

  /**
   * Limpia datos antiguos cada 10 minutos
   */
  cleanup = () => {
    setInterval(() => {
      const now = Date.now();
      for (const [key, timestamps] of this.requests.entries()) {
        const valid = timestamps.filter(t => now - t < 3600000); // 1 hora
        if (valid.length === 0) {
          this.requests.delete(key);
        } else {
          this.requests.set(key, valid);
        }
      }
    }, 600000); // Cada 10 minutos
  };
}

export default new RateLimiter();
