import nodemailer from 'nodemailer';
import Chatbot from '../../models/Chatbot.js';

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASSWORD || ''
      }
    });
  }

  /**
   * Envía confirmación de cita
   */
  async sendAppointmentConfirmation(appointmentData) {
    try {
      if (!appointmentData.customerEmail) {
        console.log('⚠️ No hay email del cliente para enviar confirmación');
        return { success: true, message: 'Sin email para enviar' };
      }

      const html = `
        <h2>¡Cita Confirmada!</h2>
        <p>Hola <strong>${appointmentData.customerName}</strong>,</p>
        <p>Tu cita ha sido confirmada con los siguientes detalles:</p>
        <ul>
          <li><strong>Fecha y hora:</strong> ${new Date(appointmentData.scheduledAt).toLocaleString('es-CL')}</li>
          <li><strong>Duración:</strong> ${appointmentData.durationMinutes} minutos</li>
          <li><strong>Razón:</strong> ${appointmentData.reason || 'No especificada'}</li>
        </ul>
        <p>Si necesitas cambiar o cancelar, responde este email.</p>
      `;

      await this.transporter.sendMail({
        from: process.env.SMTP_USER,
        to: appointmentData.customerEmail,
        subject: `Confirmación de cita - ${new Date(appointmentData.scheduledAt).toLocaleDateString('es-CL')}`,
        html
      });

      console.log(`✅ Email de confirmación enviado a ${appointmentData.customerEmail}`);
      return { success: true };
    } catch (error) {
      console.error('❌ Error enviando email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Envía confirmación de lead capturado
   */
  async sendLeadConfirmation(leadData) {
    try {
      if (!leadData.email) {
        return { success: true, message: 'Sin email para enviar' };
      }

      const html = `
        <h2>¡Gracias por tu interés!</h2>
        <p>Hola <strong>${leadData.name}</strong>,</p>
        <p>Hemos recibido tu información y nos pondremos en contacto pronto.</p>
        <p><strong>Detalles registrados:</strong></p>
        <ul>
          <li>Nombre: ${leadData.name}</li>
          <li>Email: ${leadData.email}</li>
          <li>Teléfono: ${leadData.phone || 'No proporcionado'}</li>
          <li>Empresa: ${leadData.company || 'No proporcionada'}</li>
        </ul>
      `;

      await this.transporter.sendMail({
        from: process.env.SMTP_USER,
        to: leadData.email,
        subject: 'Confirmación de tu información',
        html
      });

      console.log(`✅ Email de lead enviado a ${leadData.email}`);
      return { success: true };
    } catch (error) {
      console.error('❌ Error enviando email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Envía cotización
   */
  async sendQuote(quoteData) {
    try {
      if (!quoteData.customerEmail) {
        return { success: true, message: 'Sin email para enviar' };
      }

      const itemsHtml = quoteData.items
        .map((item, idx) => `
          <tr>
            <td>${item.description || 'Item ' + (idx + 1)}</td>
            <td>${item.quantity}</td>
            <td>${item.price ? `$${item.price.toLocaleString('es-CL')}` : 'N/A'}</td>
            <td>${item.total ? `$${item.total.toLocaleString('es-CL')}` : 'N/A'}</td>
          </tr>
        `)
        .join('');

      const html = `
        <h2>Tu Cotización</h2>
        <p>Hola <strong>${quoteData.customerName}</strong>,</p>
        <p>Aquí está la cotización solicitada:</p>
        <p><strong>Número de cotización:</strong> ${quoteData.quoteNumber}</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background: #f0f0f0;">
              <th style="border: 1px solid #ddd; padding: 10px;">Descripción</th>
              <th style="border: 1px solid #ddd; padding: 10px;">Cantidad</th>
              <th style="border: 1px solid #ddd; padding: 10px;">Precio</th>
              <th style="border: 1px solid #ddd; padding: 10px;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <h3>Total: $${quoteData.totalAmount.toLocaleString('es-CL')} ${quoteData.currency}</h3>
        ${quoteData.validUntil ? `<p><strong>Válida hasta:</strong> ${new Date(quoteData.validUntil).toLocaleDateString('es-CL')}</p>` : ''}
        ${quoteData.notes ? `<p><strong>Notas:</strong> ${quoteData.notes}</p>` : ''}
      `;

      await this.transporter.sendMail({
        from: process.env.SMTP_USER,
        to: quoteData.customerEmail,
        subject: `Cotización ${quoteData.quoteNumber}`,
        html
      });

      console.log(`✅ Cotización enviada a ${quoteData.customerEmail}`);
      return { success: true };
    } catch (error) {
      console.error('❌ Error enviando cotización:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Envía recordatorio de cita (para el día anterior)
   */
  async sendAppointmentReminder(appointmentData) {
    try {
      if (!appointmentData.customerEmail) {
        return { success: true, message: 'Sin email para enviar' };
      }

      const html = `
        <h2>Recordatorio de tu cita</h2>
        <p>Hola <strong>${appointmentData.customerName}</strong>,</p>
        <p>Te recordamos que tienes una cita mañana:</p>
        <ul>
          <li><strong>Hora:</strong> ${new Date(appointmentData.scheduledAt).toLocaleTimeString('es-CL')}</li>
          <li><strong>Razón:</strong> ${appointmentData.reason || 'No especificada'}</li>
        </ul>
        <p>Si necesitas reprogramar, contáctanos cuanto antes.</p>
      `;

      await this.transporter.sendMail({
        from: process.env.SMTP_USER,
        to: appointmentData.customerEmail,
        subject: 'Recordatorio de tu cita mañana',
        html
      });

      console.log(`✅ Recordatorio enviado a ${appointmentData.customerEmail}`);
      return { success: true };
    } catch (error) {
      console.error('❌ Error enviando recordatorio:', error);
      return { success: false, error: error.message };
    }
  }
  async sendInvitation({ email, workspaceName, role, inviteUrl }) {
    const roleLabels = { admin: 'Administrador', member: 'Operador', owner: 'Owner' };
    try {
      await this.transporter.sendMail({
        from: `"Pielo" <${process.env.SMTP_USER}>`,
        to: email,
        subject: `Te invitaron a unirte a ${workspaceName} en Pielo`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#F4F0E8;border-radius:12px;">
            <div style="font-size:22px;font-weight:700;margin-bottom:8px;">Pielo</div>
            <h2 style="margin:0 0 12px;font-size:20px;">Te invitaron a <em>${workspaceName}</em></h2>
            <p style="color:#555;margin-bottom:24px;">
              Tienes una invitación para unirte al workspace <strong>${workspaceName}</strong> como <strong>${roleLabels[role] || role}</strong>.
            </p>
            <a href="${inviteUrl}" style="display:inline-block;padding:12px 28px;background:#DCFF1E;color:#15140F;font-weight:700;border-radius:8px;text-decoration:none;font-size:15px;">
              Aceptar invitación →
            </a>
            <p style="margin-top:24px;font-size:12px;color:#888;">
              Este link expira en 7 días. Si no esperabas esta invitación, ignora este email.
            </p>
          </div>
        `,
      });
      return { success: true };
    } catch (error) {
      console.error('❌ Error enviando invitación:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Notifica al equipo (alertas de error en producción, tickets de soporte, etc.).
   * No-op silencioso si no hay SMTP configurado.
   */
  async notifyAdmin(subject, html) {
    try {
      if (!process.env.SMTP_USER) return { success: false, message: 'SMTP no configurado' };
      const to = process.env.ADMIN_ALERT_EMAIL || process.env.SMTP_USER;
      await this.transporter.sendMail({ from: process.env.SMTP_USER, to, subject, html });
      return { success: true };
    } catch (error) {
      console.error('❌ notifyAdmin:', error.message);
      return { success: false, error: error.message };
    }
  }
}

export default new EmailService();
