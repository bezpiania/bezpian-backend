import jwt from 'jsonwebtoken';
import { User, Workspace, WorkspaceMember } from '../../models/index.js';

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const FRONTEND_URL         = process.env.FRONTEND_URL || 'http://localhost:5173';
const BACKEND_URL          = process.env.BACKEND_URL  || 'http://localhost:5001';

function getRedirectUri() {
  return `${BACKEND_URL}/api/auth/google/callback`;
}

/**
 * GET /api/auth/google
 * Redirige al consentimiento de Google
 */
export const googleRedirect = (req, res) => {
  const params = new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    redirect_uri:  getRedirectUri(),
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'offline',
    prompt:        'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};

/**
 * GET /api/auth/google/callback
 * Google redirige acá con el código. Intercambia por tokens, crea/busca user y
 * redirige al frontend con accessToken + refreshToken en la URL.
 */
export const googleCallback = async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect(`${FRONTEND_URL}/login?error=google_denied`);
  }

  try {
    // 1. Intercambiar código por tokens de Google
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri:  getRedirectUri(),
        grant_type:    'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('Google token exchange failed:', tokenData);
      return res.redirect(`${FRONTEND_URL}/login?error=google_token`);
    }

    // 2. Obtener perfil del usuario de Google
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();

    if (!profile.email) {
      return res.redirect(`${FRONTEND_URL}/login?error=google_profile`);
    }

    // 3. Buscar o crear usuario
    let user = await User.findOne({ email: profile.email.toLowerCase() });

    if (!user) {
      // Nuevo usuario — crear cuenta y workspace
      user = new User({
        email:         profile.email.toLowerCase(),
        name:          profile.name || profile.email.split('@')[0],
        avatar:        profile.picture || '',
        passwordHash:  'GOOGLE_OAUTH',   // no usable para login normal
        emailVerified: true,
        googleId:      profile.sub,
      });
      await user.save();

      const slug = `workspace-${user._id.toString().slice(-8)}`.toLowerCase();
      const workspace = new Workspace({
        ownerId: user._id,
        name:    `${user.name}'s Workspace`,
        slug,
        plan:    'free',
      });
      await workspace.save();

      user.defaultWorkspaceId = workspace._id;
      await user.save();

      await WorkspaceMember.findOneAndUpdate(
        { workspaceId: workspace._id, userId: user._id },
        { role: 'owner', status: 'active', joinedAt: new Date() },
        { upsert: true, new: true }
      );
    } else {
      // Usuario existente — actualizar googleId si no lo tiene
      if (!user.googleId) {
        user.googleId = profile.sub;
        if (!user.avatar && profile.picture) user.avatar = profile.picture;
        await user.save();
      }
    }

    user.lastLoginAt = new Date();
    await user.save();

    // 4. Generar JWT
    const accessToken = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // 5. Redirigir al frontend con tokens en query params
    const params = new URLSearchParams({
      accessToken,
      refreshToken,
      userId:           user._id.toString(),
      name:             user.name || '',
      email:            user.email,
      defaultWorkspaceId: (user.defaultWorkspaceId || '').toString(),
    });

    res.redirect(`${FRONTEND_URL}/auth/google/success?${params}`);
  } catch (err) {
    console.error('❌ googleCallback error:', err);
    res.redirect(`${FRONTEND_URL}/login?error=google_server`);
  }
};
