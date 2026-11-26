const crypto = require('crypto');
const { query } = require('../database');

// =====================================================================
// Autenticação por COOKIE assinado (sem bibliotecas externas)
//
// Como funciona:
//  1. No login o servidor cria um "token" = dados (id do usuário + validade) + assinatura HMAC.
//  2. O token vai para o navegador em um cookie HttpOnly (JavaScript do site não consegue ler).
//  3. A cada requisição o navegador devolve o cookie sozinho.
//  4. O middleware "identificar" confere a assinatura, busca o usuário no banco
//     e coloca em req.usuario. Se alguém alterar o cookie, a assinatura não bate.
// =====================================================================

const NOME_COOKIE = 'gearhub_sessao';
const DURACAO_SEGUNDOS = 60 * 60 * 2; // 2 horas
const SEGREDO = process.env.SESSION_SECRET || 'gearhub-segredo-de-desenvolvimento';

if (!process.env.SESSION_SECRET) {
    console.warn('⚠️  SESSION_SECRET não definido no .env - usando segredo padrão (ok só para desenvolvimento).');
}

// ---------- Senhas (scrypt do próprio Node: nada de senha em texto puro no banco) ----------
function hashSenha(senha) {
    const sal = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(senha, sal, 64).toString('hex');
    return `${sal}:${hash}`;
}

function conferirSenha(senha, armazenado) {
    if (!armazenado || !armazenado.includes(':')) return false;
    const [sal, hash] = armazenado.split(':');
    const calculado = crypto.scryptSync(senha, sal, 64);
    const original = Buffer.from(hash, 'hex');
    return original.length === calculado.length && crypto.timingSafeEqual(original, calculado);
}

// ---------- Token assinado ----------
function assinar(texto) {
    return crypto.createHmac('sha256', SEGREDO).update(texto).digest('hex');
}

function criarToken(idUsuario) {
    const dados = { id: idUsuario, exp: Math.floor(Date.now() / 1000) + DURACAO_SEGUNDOS };
    const corpo = Buffer.from(JSON.stringify(dados)).toString('base64url');
    return `${corpo}.${assinar(corpo)}`;
}

function lerToken(token) {
    if (!token || !token.includes('.')) return null;
    const [corpo, assinatura] = token.split('.');
    const esperada = assinar(corpo);
    const a = Buffer.from(assinatura, 'utf8');
    const b = Buffer.from(esperada, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null; // adulterado
    try {
        const dados = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'));
        if (!dados.id || dados.exp < Math.floor(Date.now() / 1000)) return null; // expirado
        return dados;
    } catch (erro) {
        return null;
    }
}

// ---------- Cookies ----------
function lerCookies(req) {
    const cookies = {};
    const cabecalho = req.headers && req.headers.cookie;
    if (!cabecalho) return cookies;
    cabecalho.split(';').forEach(par => {
        const posicao = par.indexOf('=');
        if (posicao > -1) {
            cookies[par.slice(0, posicao).trim()] = decodeURIComponent(par.slice(posicao + 1).trim());
        }
    });
    return cookies;
}

function definirCookieLogin(res, idUsuario) {
    res.setHeader('Set-Cookie',
        `${NOME_COOKIE}=${criarToken(idUsuario)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DURACAO_SEGUNDOS}`);
}

function limparCookieLogin(res) {
    res.setHeader('Set-Cookie', `${NOME_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// ---------- Middlewares ----------

// Roda em TODAS as requisições: descobre quem é o usuário logado (ou null)
async function identificar(req, res, next) {
    req.usuario = null;
    try {
        const dados = lerToken(lerCookies(req)[NOME_COOKIE]);
        if (dados) {
            const result = await query(
                'SELECT id_usuario, nome_usuario, email_usuario, perfil_usuario FROM public.usuario WHERE id_usuario = $1',
                [dados.id]
            );
            if (result.rows.length > 0) req.usuario = result.rows[0];
        }
    } catch (erro) {
        console.error('Erro ao identificar usuário:', erro.message);
    }
    next();
}

// Só deixa passar quem está logado
function exigirLogin(req, res, next) {
    if (!req.usuario) {
        return res.status(401).json({ sucesso: false, mensagem: 'Faça login para continuar.' });
    }
    next();
}

// Perfis: 'cliente' (só loja), 'admin' (funcionário: só administração) e 'ambos' (cliente E funcionário)
function ehAdmin(usuario) {
    return !!usuario && ['admin', 'ambos'].includes(usuario.perfil_usuario);
}

// Só deixa passar o funcionário (admin ou ambos)
function exigirAdmin(req, res, next) {
    if (!req.usuario) {
        return res.status(401).json({ sucesso: false, mensagem: 'Faça login para continuar.' });
    }
    if (!ehAdmin(req.usuario)) {
        return res.status(403).json({ sucesso: false, mensagem: 'Acesso restrito ao administrador.' });
    }
    next();
}

module.exports = {
    hashSenha, conferirSenha, criarToken, lerToken, lerCookies,
    definirCookieLogin, limparCookieLogin, identificar, exigirLogin, exigirAdmin, ehAdmin
};
