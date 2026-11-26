// Login com Google (Google Identity Services)
//
// Como funciona:
//  1. O navegador mostra o botão oficial do Google e, depois que a pessoa escolhe a conta,
//     recebe do Google um "credential" (um token JWT assinado pelo Google).
//  2. O navegador envia esse token para POST /auth/google.
//  3. Aqui no servidor o token é VERIFICADO (assinatura, validade e se foi emitido para o NOSSO Client ID).
//     Só depois disso confiamos no e-mail e no nome que vêm dentro dele.
//
// Precisa de GOOGLE_CLIENT_ID no .env (veja o README: "Login com Google").

function googleConfigurado() {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID.trim());
}

async function verificarCredencial(credential) {
    const { OAuth2Client } = require('google-auth-library');
    const clientId = process.env.GOOGLE_CLIENT_ID.trim();
    const cliente = new OAuth2Client(clientId);

    const ticket = await cliente.verifyIdToken({ idToken: credential, audience: clientId });
    const dados = ticket.getPayload();
    return {
        sub: dados.sub,                          // identificador único e permanente da conta Google
        email: dados.email,
        email_verified: dados.email_verified === true,
        name: dados.name
    };
}

module.exports = { googleConfigurado, verificarCredencial };
