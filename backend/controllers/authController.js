const crypto = require('crypto');
const { query } = require('../database');
const { enviarEmail } = require('../services/email');
const { googleConfigurado, verificarCredencial } = require('../services/google');
const { hashSenha, conferirSenha, definirCookieLogin, limparCookieLogin } = require('../middlewares/auth');

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Cadastro: sempre cria um CLIENTE (o perfil nunca vem do formulário, para ninguém virar admin sozinho)
exports.cadastrar = async (req, res) => {
    try {
        const { nome_usuario, email_usuario, senha_usuario, confirmar_senha } = req.body;
        const nome = (nome_usuario || '').trim();
        const email = (email_usuario || '').trim().toLowerCase();

        if (nome.length < 2) {
            return res.status(400).json({ sucesso: false, mensagem: 'Informe seu nome.' });
        }
        if (!REGEX_EMAIL.test(email)) {
            return res.status(400).json({ sucesso: false, mensagem: 'Informe um e-mail válido.' });
        }
        if (!senha_usuario || senha_usuario.length < 6) {
            return res.status(400).json({ sucesso: false, mensagem: 'A senha deve ter pelo menos 6 caracteres.' });
        }
        if (senha_usuario !== confirmar_senha) {
            return res.status(400).json({ sucesso: false, mensagem: 'As senhas não conferem.' });
        }

        const sql = `
            INSERT INTO public.usuario (nome_usuario, email_usuario, senha_hash_usuario, perfil_usuario)
            VALUES ($1, $2, $3, 'cliente')
            RETURNING id_usuario, nome_usuario, email_usuario, perfil_usuario
        `;
        const result = await query(sql, [nome, email, hashSenha(senha_usuario)]);
        const usuario = result.rows[0];

        definirCookieLogin(res, usuario.id_usuario); // já deixa o cliente logado
        res.status(201).json({ sucesso: true, mensagem: 'Cadastro realizado com sucesso!', usuario });
    } catch (error) {
        console.error('Erro ao cadastrar:', error);
        if (error.code === '23505' || /UNIQUE/i.test(error.message)) {
            return res.status(400).json({ sucesso: false, mensagem: 'Este e-mail já está cadastrado.' });
        }
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao realizar cadastro.' });
    }
};

// Login: confere e-mail + senha e grava o cookie
exports.login = async (req, res) => {
    try {
        const email = (req.body.email_usuario || '').trim().toLowerCase();
        const senha = req.body.senha_usuario || '';

        const result = await query('SELECT * FROM public.usuario WHERE email_usuario = $1', [email]);
        const usuario = result.rows[0];

        // mesma mensagem nos dois casos, para não revelar se o e-mail existe
        if (!usuario || !conferirSenha(senha, usuario.senha_hash_usuario)) {
            return res.status(401).json({ sucesso: false, mensagem: 'E-mail ou senha inválidos.' });
        }

        definirCookieLogin(res, usuario.id_usuario);
        res.json({
            sucesso: true,
            mensagem: 'Login realizado com sucesso!',
            usuario: {
                id_usuario: usuario.id_usuario,
                nome_usuario: usuario.nome_usuario,
                email_usuario: usuario.email_usuario,
                perfil_usuario: usuario.perfil_usuario
            }
        });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao fazer login.' });
    }
};

// Logout: apaga o cookie
exports.logout = (req, res) => {
    limparCookieLogin(res);
    res.json({ sucesso: true, mensagem: 'Você saiu da conta.' });
};

// Quem está logado? (o front usa para montar o cabeçalho)
exports.eu = (req, res) => {
    if (!req.usuario) {
        return res.json({ sucesso: true, logado: false });
    }
    res.json({ sucesso: true, logado: true, usuario: req.usuario });
};

// ---------------------------------------------------------------------
// Recuperação de senha por e-mail
//  1. A pessoa informa o e-mail  -> criamos um token aleatório e mandamos o link por e-mail.
//  2. No banco guardamos só o HASH do token (se o banco vazar, o link não pode ser refeito) + validade de 1 hora.
//  3. Ao abrir o link, a pessoa escolhe a nova senha; o token é apagado (uso único).
// ---------------------------------------------------------------------
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
const urlBase = () => (process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, '');

exports.esqueciSenha = async (req, res) => {
    const email = (req.body.email_usuario || '').trim().toLowerCase();
    if (!REGEX_EMAIL.test(email)) {
        return res.status(400).json({ sucesso: false, mensagem: 'Informe um e-mail válido.' });
    }

    try {
        const usuario = (await query(
            'SELECT id_usuario, nome_usuario FROM public.usuario WHERE email_usuario = $1', [email]
        )).rows[0];

        if (usuario) {
            const token = crypto.randomBytes(32).toString('hex');
            const expira = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
            await query(
                `UPDATE public.usuario SET token_reset_hash_usuario = $1, token_reset_expira_usuario = $2
                 WHERE id_usuario = $3`, [hashToken(token), expira, usuario.id_usuario]
            );

            const link = `${urlBase()}/frontend/redefinir_senha/redefinir_senha.html?token=${token}`;
            try {
                await enviarEmail({
                    para: email,
                    assunto: 'Gearhub - redefinição de senha',
                    texto: `Olá, ${usuario.nome_usuario}!\n\nRecebemos um pedido para redefinir a sua senha. Abra o link abaixo (vale por 1 hora):\n${link}\n\nSe não foi você, ignore este e-mail: nada será alterado.`,
                    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;border:1px solid #dde3ee;border-radius:10px;overflow:hidden">
                        <div style="background:#0b2a6f;color:#fff;padding:18px 24px;font-size:22px;font-weight:bold">Gear<span style="color:#ffc400">hub</span></div>
                        <div style="padding:24px;color:#14213d">
                            <p>Olá, <strong>${usuario.nome_usuario.replace(/</g, '&lt;')}</strong>!</p>
                            <p>Recebemos um pedido para redefinir a sua senha. O link vale por <strong>1 hora</strong>.</p>
                            <p style="text-align:center;margin:28px 0"><a href="${link}" style="background:#ffc400;color:#0b2a6f;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:6px">Criar nova senha</a></p>
                            <p style="font-size:13px;color:#5b6b8a">Se não foi você, ignore este e-mail: nada será alterado.</p>
                        </div></div>`
                });
            } catch (erroEmail) {
                // não contamos ao navegador se deu erro (evita revelar se o e-mail existe); fica no log do servidor
                console.error('Erro ao enviar e-mail de redefinição:', erroEmail.message);
            }
        }

        // mesma resposta exista ou não o e-mail
        res.json({ sucesso: true, mensagem: 'Se este e-mail estiver cadastrado, enviamos um link para redefinir a senha. Verifique sua caixa de entrada.' });
    } catch (error) {
        console.error('Erro em esqueci-senha:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao processar o pedido.' });
    }
};

exports.redefinirSenha = async (req, res) => {
    const token = String(req.body.token || '');
    const senha = req.body.senha_usuario || '';

    if (!/^[0-9a-f]{64}$/.test(token)) {
        return res.status(400).json({ sucesso: false, mensagem: 'Link inválido. Peça um novo.' });
    }
    if (senha.length < 6) {
        return res.status(400).json({ sucesso: false, mensagem: 'A senha deve ter pelo menos 6 caracteres.' });
    }
    if (senha !== req.body.confirmar_senha) {
        return res.status(400).json({ sucesso: false, mensagem: 'As senhas não conferem.' });
    }

    try {
        const usuario = (await query(
            'SELECT id_usuario, token_reset_expira_usuario FROM public.usuario WHERE token_reset_hash_usuario = $1',
            [hashToken(token)]
        )).rows[0];

        if (!usuario || !usuario.token_reset_expira_usuario || new Date(usuario.token_reset_expira_usuario) < new Date()) {
            return res.status(400).json({ sucesso: false, mensagem: 'Link inválido ou expirado. Peça um novo.' });
        }

        await query(
            `UPDATE public.usuario
             SET senha_hash_usuario = $1, token_reset_hash_usuario = NULL, token_reset_expira_usuario = NULL
             WHERE id_usuario = $2`, [hashSenha(senha), usuario.id_usuario]
        );
        res.json({ sucesso: true, mensagem: 'Senha redefinida com sucesso! Entre com a nova senha.' });
    } catch (error) {
        console.error('Erro ao redefinir senha:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao redefinir a senha.' });
    }
};

// ---------------------------------------------------------------------
// Login com Google
// ---------------------------------------------------------------------

// O front-end pergunta aqui se o login com Google está ligado (o Client ID não é segredo)
exports.config = (req, res) => {
    res.json({ sucesso: true, google_client_id: googleConfigurado() ? process.env.GOOGLE_CLIENT_ID.trim() : null });
};

exports.loginGoogle = async (req, res) => {
    if (!googleConfigurado()) {
        return res.status(400).json({ sucesso: false, mensagem: 'O login com Google não está configurado nesta loja.' });
    }
    const credential = String(req.body.credential || '');
    if (!credential) {
        return res.status(400).json({ sucesso: false, mensagem: 'Credencial do Google ausente.' });
    }

    let google;
    try {
        google = await verificarCredencial(credential);
    } catch (erro) {
        console.error('Falha ao validar o token do Google:', erro.message);
        return res.status(401).json({ sucesso: false, mensagem: 'Não foi possível validar o login com o Google.' });
    }
    if (!google.email || !google.email_verified) {
        return res.status(401).json({ sucesso: false, mensagem: 'O e-mail da sua conta Google não está verificado.' });
    }

    try {
        const email = google.email.toLowerCase();
        const colunas = 'id_usuario, nome_usuario, email_usuario, perfil_usuario, google_id_usuario';

        // 1) já entrou antes com este Google?
        let usuario = (await query(`SELECT ${colunas} FROM public.usuario WHERE google_id_usuario = $1`, [google.sub])).rows[0];

        if (!usuario) {
            // 2) já existe conta com este e-mail (verificado pelo Google)? Então vincula
            usuario = (await query(`SELECT ${colunas} FROM public.usuario WHERE email_usuario = $1`, [email])).rows[0];
            if (usuario) {
                if (usuario.google_id_usuario && usuario.google_id_usuario !== google.sub) {
                    return res.status(401).json({ sucesso: false, mensagem: 'Este e-mail já está vinculado a outra conta Google.' });
                }
                await query('UPDATE public.usuario SET google_id_usuario = $1 WHERE id_usuario = $2', [google.sub, usuario.id_usuario]);
            } else {
                // 3) primeira vez: cria um CLIENTE. A senha fica aleatória (a pessoa entra pelo Google;
                //    se quiser uma senha própria, usa "Esqueci minha senha").
                const nome = (google.name || email.split('@')[0]).trim().slice(0, 80);
                usuario = (await query(
                    `INSERT INTO public.usuario (nome_usuario, email_usuario, senha_hash_usuario, perfil_usuario, google_id_usuario)
                     VALUES ($1, $2, $3, 'cliente', $4)
                     RETURNING ${colunas}`,
                    [nome, email, hashSenha(crypto.randomBytes(32).toString('hex')), google.sub]
                )).rows[0];
            }
        }

        definirCookieLogin(res, usuario.id_usuario);
        res.json({
            sucesso: true,
            mensagem: 'Login com Google realizado com sucesso!',
            usuario: {
                id_usuario: usuario.id_usuario,
                nome_usuario: usuario.nome_usuario,
                email_usuario: usuario.email_usuario,
                perfil_usuario: usuario.perfil_usuario
            }
        });
    } catch (error) {
        console.error('Erro no login com Google:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao entrar com o Google.' });
    }
};
