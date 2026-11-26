// Envio de e-mail (SMTP) com nodemailer.
// Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (e opcionalmente SMTP_FROM, SMTP_SECURE) no .env.
// Se o SMTP não estiver configurado, o e-mail NÃO é enviado: o conteúdo (com o link) aparece no
// terminal do servidor, o que permite testar a recuperação de senha em desenvolvimento.

function smtpConfigurado() {
    return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function enviarEmail({ para, assunto, texto, html }) {
    if (!smtpConfigurado()) {
        console.log('\n📧 SMTP não configurado: e-mail NÃO enviado. Conteúdo que seria enviado a ' + para + ':\n' + texto + '\n');
        return { enviado: false };
    }

    const nodemailer = require('nodemailer');
    const transporte = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',   // true só para a porta 465
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });

    await transporte.sendMail({
        from: process.env.SMTP_FROM || `Gearhub <${process.env.SMTP_USER}>`,
        to: para,
        subject: assunto,
        text: texto,
        html
    });
    return { enviado: true };
}

module.exports = { enviarEmail, smtpConfigurado };
