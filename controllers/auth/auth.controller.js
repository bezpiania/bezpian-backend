import AuthService from '../../services/auth/auth.service.js';
import { validateEmail, validatePassword, validateRequired } from '../../middlewares/validation.middleware.js';

const authService = new AuthService();

export default class AuthController {
    signup = async (req, res) => {
        try {
            const { email, password, name, plan } = req.body;

            const missing = validateRequired(['email', 'password', 'name'], { email, password, name });
            if (missing) {
                return res.status(400).json({
                    success: false,
                    message: `Campos requeridos: ${missing.join(', ')}`
                });
            }

            if (!validateEmail(email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Email inválido'
                });
            }

            if (!validatePassword(password)) {
                return res.status(400).json({
                    success: false,
                    message: 'Password debe tener mínimo 6 caracteres'
                });
            }

            const response = await authService.signup(email, password, name, plan);
            return res.status(response.success ? 201 : 400).json(response);
        } catch (error) {
            console.error('❌ AuthController.signup:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al crear usuario'
            });
        }
    };

    login = async (req, res) => {
        try {
            const { email, password } = req.body;

            const missing = validateRequired(['email', 'password'], { email, password });
            if (missing) {
                return res.status(400).json({
                    success: false,
                    message: `Campos requeridos: ${missing.join(', ')}`
                });
            }

            if (!validateEmail(email)) {
                console.log('❌ Invalid email format:', email);
                return res.status(400).json({
                    success: false,
                    message: 'Email inválido'
                });
            }

            const response = await authService.login(email, password);
            console.log('Auth response:', response);
            return res.status(response.success ? 200 : 401).json(response);
        } catch (error) {
            console.error('❌ AuthController.login:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al hacer login'
            });
        }
    };

    logout = async (req, res) => {
        try {
            const { userId } = req.user;
            const { refreshToken } = req.body;
            const response = await authService.logout(userId, refreshToken);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ AuthController.logout:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al hacer logout'
            });
        }
    };

    refresh = async (req, res) => {
        try {
            const { refreshToken } = req.body;
            const response = await authService.refreshToken(refreshToken);
            return res.status(response.success ? 200 : 401).json(response);
        } catch (error) {
            console.error('❌ AuthController.refresh:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al renovar token'
            });
        }
    };

    verifyEmail = async (req, res) => {
        try {
            const { token } = req.body;
            const response = await authService.verifyEmail(token);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ AuthController.verifyEmail:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al verificar email'
            });
        }
    };

    resendVerification = async (req, res) => {
        try {
            const { email } = req.body;
            const response = await authService.resendVerification(email);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ AuthController.resendVerification:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al reenviar verificación'
            });
        }
    };

    forgotPassword = async (req, res) => {
        try {
            const { email } = req.body;
            const response = await authService.forgotPassword(email);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ AuthController.forgotPassword:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al solicitar reset'
            });
        }
    };

    resetPassword = async (req, res) => {
        try {
            const { token, newPassword } = req.body;

            const missing = validateRequired(['token', 'newPassword'], { token, newPassword });
            if (missing) {
                return res.status(400).json({
                    success: false,
                    message: `Campos requeridos: ${missing.join(', ')}`
                });
            }

            if (!validatePassword(newPassword)) {
                return res.status(400).json({
                    success: false,
                    message: 'Password debe tener mínimo 6 caracteres'
                });
            }

            const response = await authService.resetPassword(token, newPassword);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ AuthController.resetPassword:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al resetear password'
            });
        }
    };

    getMe = async (req, res) => {
        try {
            const { userId } = req.user;
            const response = await authService.getProfile(userId);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ AuthController.getMe:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al obtener perfil'
            });
        }
    };

    updateMe = async (req, res) => {
        try {
            const { userId } = req.user;
            const updates = req.body;
            const response = await authService.updateProfile(userId, updates);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ AuthController.updateMe:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al actualizar perfil'
            });
        }
    };

    changePassword = async (req, res) => {
        try {
            const { userId } = req.user;
            const { currentPassword, newPassword } = req.body;

            const missing = validateRequired(['currentPassword', 'newPassword'], { currentPassword, newPassword });
            if (missing) {
                return res.status(400).json({
                    success: false,
                    message: `Campos requeridos: ${missing.join(', ')}`
                });
            }

            if (!validatePassword(newPassword)) {
                return res.status(400).json({
                    success: false,
                    message: 'Password debe tener mínimo 6 caracteres'
                });
            }

            const response = await authService.changePassword(userId, currentPassword, newPassword);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ AuthController.changePassword:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al cambiar password'
            });
        }
    };

    deleteMe = async (req, res) => {
        try {
            const { userId } = req.user;
            const response = await authService.deleteAccount(userId);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ AuthController.deleteMe:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al eliminar cuenta'
            });
        }
    };
}
