import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User, RefreshToken, Workspace, WorkspaceMember } from '../../models/index.js';
import emailService from '../notifications/email.service.js';

export default class AuthService {
  signup = async (email, password, name) => {
    try {
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return { success: false, message: 'El email ya está registrado' };
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const emailVerificationToken = crypto.randomBytes(32).toString('hex');

      const user = new User({
        email: email.toLowerCase(),
        passwordHash,
        name,
        emailVerificationToken,
        emailVerified: false
      });

      await user.save();

      // Create default workspace for the user
      const slug = `workspace-${user._id.toString().slice(-8)}`.toLowerCase();
      const workspace = new Workspace({
        ownerId: user._id,
        name: `${name}'s Workspace`,
        slug,
        plan: 'free'
      });

      await workspace.save();

      // Set the default workspace ID on the user
      user.defaultWorkspaceId = workspace._id;
      await user.save();

      // Create owner membership
      await WorkspaceMember.create({
        workspaceId: workspace._id,
        userId: user._id,
        role: 'owner',
        status: 'active',
        joinedAt: new Date()
      });

      // Auto-login: generate tokens so user lands directly on dashboard
      const accessToken = jwt.sign(
        { userId: user._id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const refreshToken = crypto.randomBytes(32).toString('hex');
      await RefreshToken.create({
        token: refreshToken,
        userId: user._id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      // Enviar email de verificación (no bloquea la respuesta)
      setImmediate(() => {
        emailService.sendEmailVerification({
          email: user.email,
          name: user.name,
          token: emailVerificationToken
        });
      });

      return {
        success: true,
        message: 'Cuenta creada exitosamente',
        data: {
          accessToken,
          refreshToken,
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            avatar: user.avatar || null,
            defaultWorkspaceId: workspace._id,
            workspaceRole: 'owner'
          }
        }
      };
    } catch (error) {
      console.error('❌ AuthService.signup:', error);
      return { success: false, message: error.message };
    }
  };

  login = async (email, password) => {
    try {
      const user = await User.findOne({ email: email.toLowerCase() });

      if (!user) {
        return { success: false, message: 'Email o contraseña incorrectos' };
      }

      const passwordMatch = await bcrypt.compare(password, user.passwordHash);
      if (!passwordMatch) {
        return { success: false, message: 'Email o contraseña incorrectos' };
      }

      // Si el usuario no tiene workspace default, crear uno ahora
      let defaultWorkspaceId = user.defaultWorkspaceId;
      if (!defaultWorkspaceId) {
        const { Workspace } = await import('../../models/index.js');
        const slug = `workspace-${user._id.toString().slice(-8)}`.toLowerCase();
        const workspace = new Workspace({ ownerId: user._id, name: `${user.name}'s Workspace`, slug, plan: 'free' });
        await workspace.save();
        defaultWorkspaceId = workspace._id;
        user.defaultWorkspaceId = defaultWorkspaceId;
        await user.save();
        // Ensure owner membership exists
        await WorkspaceMember.findOneAndUpdate(
          { workspaceId: defaultWorkspaceId, userId: user._id },
          { role: 'owner', status: 'active', joinedAt: new Date() },
          { upsert: true, new: true }
        );
      } else {
        // Ensure membership exists for users created before this fix
        const exists = await WorkspaceMember.findOne({ workspaceId: defaultWorkspaceId, userId: user._id });
        if (!exists) {
          await WorkspaceMember.create({ workspaceId: defaultWorkspaceId, userId: user._id, role: 'owner', status: 'active', joinedAt: new Date() });
        }
      }

      const accessToken = jwt.sign(
        { userId: user._id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const refreshToken = crypto.randomBytes(32).toString('hex');
      await RefreshToken.create({
        token: refreshToken,
        userId: user._id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() });

      // Get user's role — owner of workspace always gets owner role
      const workspace = await Workspace.findById(defaultWorkspaceId).select('ownerId plan');
      const isOwner = workspace?.ownerId?.toString() === user._id.toString();
      const membership = await WorkspaceMember.findOne({ workspaceId: defaultWorkspaceId, userId: user._id });
      const workspaceRole = isOwner ? 'owner' : (membership?.role || 'member');

      return {
        success: true,
        message: 'Login exitoso',
        data: {
          accessToken,
          refreshToken,
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
            defaultWorkspaceId,
            workspaceRole,
            workspacePlan: workspace?.plan || 'free',
            scopedChatbotId: membership?.scopedChatbotId ? membership.scopedChatbotId.toString() : null,
          }
        }
      };
    } catch (error) {
      console.error('❌ AuthService.login:', error);
      return { success: false, message: error.message };
    }
  };

  logout = async (userId, refreshToken) => {
    try {
      await RefreshToken.updateOne(
        { token: refreshToken },
        { revokedAt: new Date() }
      );
      return { success: true, message: 'Logout exitoso' };
    } catch (error) {
      console.error('❌ AuthService.logout:', error);
      return { success: false, message: error.message };
    }
  };

  refreshToken = async (refreshToken) => {
    try {
      const token = await RefreshToken.findOne({ token: refreshToken });

      if (!token || token.revokedAt || new Date() > token.expiresAt) {
        return { success: false, message: 'Token inválido o expirado' };
      }

      const user = await User.findById(token.userId);
      const newAccessToken = jwt.sign(
        { userId: user._id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      return {
        success: true,
        message: 'Token renovado',
        data: { accessToken: newAccessToken }
      };
    } catch (error) {
      console.error('❌ AuthService.refreshToken:', error);
      return { success: false, message: error.message };
    }
  };

  verifyEmail = async (token) => {
    try {
      const user = await User.findOne({ emailVerificationToken: token });

      if (!user) {
        return { success: false, message: 'Token inválido' };
      }

      await User.updateOne(
        { _id: user._id },
        { emailVerified: true, emailVerificationToken: null }
      );

      return { success: true, message: 'Email verificado' };
    } catch (error) {
      console.error('❌ AuthService.verifyEmail:', error);
      return { success: false, message: error.message };
    }
  };

  resendVerification = async (email) => {
    try {
      const user = await User.findOne({ email: email.toLowerCase() });

      if (!user) {
        return { success: false, message: 'Usuario no encontrado' };
      }

      if (user.emailVerified) {
        return { success: false, message: 'Email ya verificado' };
      }

      const emailVerificationToken = crypto.randomBytes(32).toString('hex');
      await User.updateOne({ _id: user._id }, { emailVerificationToken });

      setImmediate(() => {
        emailService.sendEmailVerification({
          email: user.email,
          name: user.name,
          token: emailVerificationToken
        });
      });

      return { success: true, message: 'Email de verificación reenviado' };
    } catch (error) {
      console.error('❌ AuthService.resendVerification:', error);
      return { success: false, message: error.message };
    }
  };

  forgotPassword = async (email) => {
    try {
      const user = await User.findOne({ email: email.toLowerCase() });

      if (!user) {
        return { success: true, message: 'Si el email existe, recibirá instrucciones' };
      }

      const passwordResetToken = crypto.randomBytes(32).toString('hex');
      const passwordResetExpiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000);

      await User.updateOne(
        { _id: user._id },
        { passwordResetToken, passwordResetExpiresAt }
      );

      setImmediate(() => {
        emailService.sendPasswordReset({
          email: user.email,
          name: user.name,
          token: passwordResetToken
        });
      });

      return { success: true, message: 'Si el email existe, recibirás instrucciones en breve' };
    } catch (error) {
      console.error('❌ AuthService.forgotPassword:', error);
      return { success: false, message: error.message };
    }
  };

  resetPassword = async (token, newPassword) => {
    try {
      const user = await User.findOne({ passwordResetToken: token });

      if (!user || new Date() > user.passwordResetExpiresAt) {
        return { success: false, message: 'Token inválido o expirado' };
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);

      await User.updateOne(
        { _id: user._id },
        { passwordHash, passwordResetToken: null, passwordResetExpiresAt: null }
      );

      return { success: true, message: 'Password actualizado' };
    } catch (error) {
      console.error('❌ AuthService.resetPassword:', error);
      return { success: false, message: error.message };
    }
  };

  getProfile = async (userId) => {
    try {
      const user = await User.findById(userId).select('-passwordHash');

      if (!user) {
        return { success: false, message: 'Usuario no encontrado' };
      }

      return {
        success: true,
        message: 'Perfil obtenido',
        data: { user }
      };
    } catch (error) {
      console.error('❌ AuthService.getProfile:', error);
      return { success: false, message: error.message };
    }
  };

  updateProfile = async (userId, updates) => {
    try {
      const allowedFields = ['name', 'avatar'];
      const filteredUpdates = {};

      allowedFields.forEach(field => {
        if (updates[field]) filteredUpdates[field] = updates[field];
      });

      const user = await User.findByIdAndUpdate(userId, filteredUpdates, { new: true });

      return {
        success: true,
        message: 'Perfil actualizado',
        data: { user }
      };
    } catch (error) {
      console.error('❌ AuthService.updateProfile:', error);
      return { success: false, message: error.message };
    }
  };

  changePassword = async (userId, currentPassword, newPassword) => {
    try {
      const user = await User.findById(userId);

      const passwordMatch = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!passwordMatch) {
        return { success: false, message: 'Contraseña actual incorrecta' };
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await User.updateOne({ _id: userId }, { passwordHash });

      return { success: true, message: 'Password cambiado' };
    } catch (error) {
      console.error('❌ AuthService.changePassword:', error);
      return { success: false, message: error.message };
    }
  };

  deleteAccount = async (userId) => {
    try {
      await User.deleteOne({ _id: userId });
      await RefreshToken.deleteMany({ userId });

      return { success: true, message: 'Cuenta eliminada' };
    } catch (error) {
      console.error('❌ AuthService.deleteAccount:', error);
      return { success: false, message: error.message };
    }
  };
}
