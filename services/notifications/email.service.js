import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.EMAIL_FROM || 'Pielo <noreply@pielo.app>';
const ADMIN_EMAIL = process.env.ADMIN_ALERT_EMAIL || process.env.EMAIL_FROM;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const isConfigured = () => Boolean(process.env.RESEND_API_KEY);

const send = async ({ to, subject, html }) => {
  if (!isConfigured()) {
    console.warn('⚠️ RESEND_API_KEY no configurada — email no enviado:', subject);
    return { success: false, message: 'Email service not configured' };
  }
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
    return { success: true };
  } catch (error) {
    console.error('❌ EmailService:', error.message);
    return { success: false, error: error.message };
  }
};

// ─── Templates base ──────────────────────────────────────────────────────────

const wrap = (content) => `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F0E8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F0E8;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.07);">
        <tr>
          <td style="background:#15140F;padding:24px 32px;">
            <span style="font-size:20px;font-weight:700;color:#DCFF1E;letter-spacing:-0.5px;">Pielo</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            ${content}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;background:#F9F8F5;border-top:1px solid #EEE;">
            <p style="margin:0;font-size:11px;color:#AAA;text-align:center;">
              Pielo · Tu asistente que nunca duerme · <a href="${FRONTEND_URL}" style="color:#AAA;">pielo.app</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const btn = (text, url) =>
  `<a href="${url}" style="display:inline-block;padding:12px 28px;background:#DCFF1E;color:#15140F;font-weight:700;border-radius:8px;text-decoration:none;font-size:15px;margin-top:8px;">${text} →</a>`;

const h2 = (text) =>
  `<h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#15140F;">${text}</h2>`;

const p = (text) =>
  `<p style="margin:0 0 12px;font-size:15px;color:#444;line-height:1.6;">${text}</p>`;

// ─── Auth emails ──────────────────────────────────────────────────────────────

class EmailService {

  // 1. Verificación de email (signup + resend)
  sendEmailVerification = async ({ email, name, token }) => {
    const verifyUrl = `${FRONTEND_URL}/verificar-email?token=${token}`;
    return send({
      to: email,
      subject: 'Verifica tu email · Pielo',
      html: wrap(`
        ${h2('Verifica tu email')}
        ${p(`Hola <strong>${name}</strong>, gracias por registrarte en Pielo.`)}
        ${p('Haz clic en el botón para activar tu cuenta. El link expira en 24 horas.')}
        ${btn('Verificar email', verifyUrl)}
        <p style="margin-top:24px;font-size:12px;color:#AAA;">
          Si no creaste una cuenta, ignora este email.
        </p>
      `)
    });
  };

  // 2. Bienvenida post-verificación
  sendWelcome = async ({ email, name }) => {
    const dashboardUrl = `${FRONTEND_URL}/bots`;
    return send({
      to: email,
      subject: '¡Bienvenido a Pielo! 🤖',
      html: wrap(`
        ${h2(`¡Hola ${name}, ya estás dentro!`)}
        ${p('Tu cuenta está lista. En 5 minutos puedes tener tu primer bot trabajando.')}
        ${p('Crea tu bot, pega el código en tu sitio, y empieza a convertir visitas en clientes.')}
        ${btn('Crear mi primer bot', dashboardUrl)}
      `)
    });
  };

  // 3. Reset de contraseña
  sendPasswordReset = async ({ email, name, token }) => {
    const resetUrl = `${FRONTEND_URL}/recuperar?token=${token}`;
    return send({
      to: email,
      subject: 'Recupera tu contraseña · Pielo',
      html: wrap(`
        ${h2('Recuperar contraseña')}
        ${p(`Hola <strong>${name}</strong>, recibimos tu solicitud para resetear la contraseña.`)}
        ${p('El link expira en <strong>1 hora</strong>. Si no lo solicitaste, ignora este email.')}
        ${btn('Cambiar contraseña', resetUrl)}
      `)
    });
  };

  // 4. Invitación a workspace
  sendInvitation = async ({ email, workspaceName, role, inviteUrl }) => {
    const roleLabels = { admin: 'Administrador', member: 'Operador', owner: 'Owner' };
    return send({
      to: email,
      subject: `Te invitaron a ${workspaceName} · Pielo`,
      html: wrap(`
        ${h2(`Invitación a <em>${workspaceName}</em>`)}
        ${p(`Tienes una invitación para unirte como <strong>${roleLabels[role] || role}</strong>.`)}
        ${btn('Aceptar invitación', inviteUrl)}
        <p style="margin-top:16px;font-size:12px;color:#AAA;">
          Este link expira en 7 días.
        </p>
      `)
    });
  };

  // 5. Confirmación de cita (para el cliente final del chatbot)
  sendAppointmentConfirmation = async (appointmentData) => {
    if (!appointmentData.customerEmail) return { success: true, message: 'Sin email' };
    const fecha = new Date(appointmentData.scheduledAt).toLocaleString('es-CL', {
      dateStyle: 'full', timeStyle: 'short'
    });
    return send({
      to: appointmentData.customerEmail,
      subject: `Cita confirmada · ${new Date(appointmentData.scheduledAt).toLocaleDateString('es-CL')}`,
      html: wrap(`
        ${h2('¡Cita confirmada!')}
        ${p(`Hola <strong>${appointmentData.customerName}</strong>, tu cita está agendada.`)}
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px;border-bottom:1px solid #EEE;color:#888;font-size:13px;">Fecha y hora</td><td style="padding:8px;border-bottom:1px solid #EEE;font-weight:600;">${fecha}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #EEE;color:#888;font-size:13px;">Duración</td><td style="padding:8px;border-bottom:1px solid #EEE;">${appointmentData.durationMinutes} minutos</td></tr>
          ${appointmentData.reason ? `<tr><td style="padding:8px;color:#888;font-size:13px;">Motivo</td><td style="padding:8px;">${appointmentData.reason}</td></tr>` : ''}
        </table>
        ${p('Si necesitas cambiar o cancelar, responde este email.')}
      `)
    });
  };

  // 6. Recordatorio de cita (día anterior)
  sendAppointmentReminder = async (appointmentData) => {
    if (!appointmentData.customerEmail) return { success: true, message: 'Sin email' };
    const hora = new Date(appointmentData.scheduledAt).toLocaleTimeString('es-CL', { timeStyle: 'short' });
    return send({
      to: appointmentData.customerEmail,
      subject: 'Recordatorio: tienes una cita mañana',
      html: wrap(`
        ${h2('Recordatorio de cita')}
        ${p(`Hola <strong>${appointmentData.customerName}</strong>, te recordamos tu cita de mañana.`)}
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px;border-bottom:1px solid #EEE;color:#888;font-size:13px;">Hora</td><td style="padding:8px;border-bottom:1px solid #EEE;font-weight:600;">${hora}</td></tr>
          ${appointmentData.reason ? `<tr><td style="padding:8px;color:#888;font-size:13px;">Motivo</td><td style="padding:8px;">${appointmentData.reason}</td></tr>` : ''}
        </table>
        ${p('Si necesitas reprogramar, contáctanos cuanto antes.')}
      `)
    });
  };

  // 7. Confirmación de lead
  sendLeadConfirmation = async (leadData) => {
    if (!leadData.email) return { success: true, message: 'Sin email' };
    return send({
      to: leadData.email,
      subject: 'Recibimos tu información',
      html: wrap(`
        ${h2('¡Gracias por tu interés!')}
        ${p(`Hola <strong>${leadData.name}</strong>, hemos recibido tu información.`)}
        ${p('Nos pondremos en contacto pronto.')}
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          ${leadData.phone ? `<tr><td style="padding:8px;border-bottom:1px solid #EEE;color:#888;font-size:13px;">Teléfono</td><td style="padding:8px;border-bottom:1px solid #EEE;">${leadData.phone}</td></tr>` : ''}
          ${leadData.company ? `<tr><td style="padding:8px;color:#888;font-size:13px;">Empresa</td><td style="padding:8px;">${leadData.company}</td></tr>` : ''}
        </table>
      `)
    });
  };

  // 8. Cotización al cliente
  sendQuote = async (quoteData) => {
    if (!quoteData.customerEmail) return { success: true, message: 'Sin email' };
    const itemsHtml = (quoteData.items || []).map((item, idx) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #EEE;">${item.description || 'Item ' + (idx + 1)}</td>
        <td style="padding:8px;border-bottom:1px solid #EEE;text-align:center;">${item.quantity}</td>
        <td style="padding:8px;border-bottom:1px solid #EEE;text-align:right;">${item.price ? `$${Number(item.price).toLocaleString('es-CL')}` : '-'}</td>
        <td style="padding:8px;border-bottom:1px solid #EEE;text-align:right;font-weight:600;">${item.total ? `$${Number(item.total).toLocaleString('es-CL')}` : '-'}</td>
      </tr>`).join('');
    return send({
      to: quoteData.customerEmail,
      subject: `Cotización ${quoteData.quoteNumber}`,
      html: wrap(`
        ${h2(`Cotización ${quoteData.quoteNumber}`)}
        ${p(`Hola <strong>${quoteData.customerName}</strong>, aquí está la cotización solicitada.`)}
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <thead>
            <tr style="background:#F4F0E8;">
              <th style="padding:10px;text-align:left;font-size:13px;">Descripción</th>
              <th style="padding:10px;text-align:center;font-size:13px;">Cant.</th>
              <th style="padding:10px;text-align:right;font-size:13px;">Precio</th>
              <th style="padding:10px;text-align:right;font-size:13px;">Total</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <p style="text-align:right;font-size:18px;font-weight:700;margin:8px 0;">
          Total: $${Number(quoteData.totalAmount).toLocaleString('es-CL')} ${quoteData.currency || 'CLP'}
        </p>
        ${quoteData.validUntil ? p(`<strong>Válida hasta:</strong> ${new Date(quoteData.validUntil).toLocaleDateString('es-CL')}`) : ''}
        ${quoteData.notes ? p(`<strong>Notas:</strong> ${quoteData.notes}`) : ''}
      `)
    });
  };

  // 9. Notificación admin (errores, tickets de soporte)
  notifyAdmin = async (subject, html) => {
    if (!isConfigured() || !ADMIN_EMAIL) return { success: false, message: 'No configurado' };
    return send({ to: ADMIN_EMAIL, subject: `[Pielo Admin] ${subject}`, html });
  };

  // 10. Notificación de nuevo lead al dueño del workspace
  sendLeadNotification = async ({ ownerEmail, botName, leadName, leadEmail, leadPhone }) => {
    if (!ownerEmail) return { success: true, message: 'Sin email' };
    return send({
      to: ownerEmail,
      subject: `Nuevo lead en ${botName}`,
      html: wrap(`
        ${h2(`Nuevo lead capturado`)}
        ${p(`Tu bot <strong>${botName}</strong> capturó un nuevo lead.`)}
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px;border-bottom:1px solid #EEE;color:#888;font-size:13px;">Nombre</td><td style="padding:8px;border-bottom:1px solid #EEE;font-weight:600;">${leadName}</td></tr>
          ${leadEmail ? `<tr><td style="padding:8px;border-bottom:1px solid #EEE;color:#888;font-size:13px;">Email</td><td style="padding:8px;border-bottom:1px solid #EEE;">${leadEmail}</td></tr>` : ''}
          ${leadPhone ? `<tr><td style="padding:8px;color:#888;font-size:13px;">Teléfono</td><td style="padding:8px;">${leadPhone}</td></tr>` : ''}
        </table>
        ${btn('Ver en dashboard', `${FRONTEND_URL}/leads`)}
      `)
    });
  };
}

export default new EmailService();
