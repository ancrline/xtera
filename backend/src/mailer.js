import nodemailer from "nodemailer";

let transport = null;

function getTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  if (!transport) {
    const port = Number(SMTP_PORT || 465);
    transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
  }
  return transport;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendPasswordResetEmail({ to, name, link, expiresMinutes }) {
  const mailer = getTransport();
  if (!mailer) {
    throw new Error("SMTP is not configured (SMTP_HOST, SMTP_USER, SMTP_PASS)");
  }

  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const safeName = escapeHtml(name);
  const safeLink = escapeHtml(link);

  await mailer.sendMail({
    from,
    to,
    subject: "Reset your XTERA Job Reports password",
    text:
      `Hi ${name},\n\n` +
      `We received a request to reset your XTERA Job Reports password. ` +
      `Use the link below to choose a new one. It expires in ${expiresMinutes} minutes and can only be used once.\n\n` +
      `${link}\n\n` +
      `If you didn't request this, you can ignore this email and your password will stay the same.`,
    html:
      `<p>Hi ${safeName},</p>` +
      `<p>We received a request to reset your XTERA Job Reports password. ` +
      `Use the button below to choose a new one. The link expires in ${expiresMinutes} minutes and can only be used once.</p>` +
      `<p><a href="${safeLink}" style="display:inline-block;padding:10px 18px;background:#0d6efd;color:#fff;text-decoration:none;border-radius:6px;">Reset password</a></p>` +
      `<p>Or paste this link into your browser:<br>${safeLink}</p>` +
      `<p>If you didn't request this, you can ignore this email and your password will stay the same.</p>`
  });
}
