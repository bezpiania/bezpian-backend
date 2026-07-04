import jwt from 'jsonwebtoken';

export const authMiddleware = (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Token no proporcionado'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;

        // Seguridad del rol 'client' (cliente final del plan Empresa): solo puede
        // operar sobre su bot scopeado y no accede a la gestión del workspace.
        if (decoded.role === 'client') {
            const scoped = decoded.scopedChatbotId;
            if (!scoped) {
                return res.status(403).json({ success: false, message: 'Acceso restringido' });
            }
            const path = req.path || '';
            // Bloquear gestión: equipo, facturación, invitaciones, plan, admin.
            if (/\/members|\/billing|\/invitations|\/plan|\/admin/.test(path)) {
                return res.status(403).json({ success: false, message: 'No autorizado para esta acción' });
            }
            // Forzar el filtro a su bot en query y body: no puede consultar otros chatbots.
            req.query = req.query || {};
            req.query.chatbotId = scoped;
            if (req.query.botId) req.query.botId = scoped;
            if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
                if (req.body.chatbotId) req.body.chatbotId = scoped;
                if (req.body.botId) req.body.botId = scoped;
            }
            req.clientScopedChatbotId = scoped;
        }

        next();
    } catch (error) {
        console.error('❌ Auth middleware:', error);
        return res.status(401).json({
            success: false,
            message: 'Token inválido o expirado'
        });
    }
};

export const optionalAuthMiddleware = (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded;
        }
        next();
    } catch (error) {
        next();
    }
};
