// Envoi des e-mails (réinitialisation du mot de passe).
// Avec SMTP_HOST configuré, les messages partent réellement. Sans configuration (développement),
// le message est affiché dans la console du serveur au lieu d'être envoyé.
const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

async function sendMail({ to, subject, text }) {
  const transport = getTransporter();
  if (!transport) {
    console.log(`\n[e-mail non envoyé : SMTP non configuré]\nÀ : ${to}\nObjet : ${subject}\n\n${text}\n`);
    return { delivered: false };
  }
  await transport.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text });
  return { delivered: true };
}

module.exports = { sendMail };
