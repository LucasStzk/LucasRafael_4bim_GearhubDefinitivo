// =====================================================================
// Funções compartilhadas por todas as páginas do Gearhub
// (chamadas à API, usuário logado, carrinho e formatações)
// =====================================================================

const API = '';                       // mesma origem do servidor (http://localhost:3001) => o cookie vai junto
const IMG_PADRAO = '/imagens/silhueta.png';
const CHAVE_CARRINHO = 'gearhub_carrinho';

let usuarioAtual = null;

// ---------- Chamada à API ----------
// Uso: api('/periferico/listar')  |  api('/auth/login', { json: {...} })  |  api('/x', { method: 'PUT', json: {...} })
async function api(caminho, opcoes = {}) {
    const { json, ...config } = opcoes;
    config.credentials = 'same-origin';
    config.headers = config.headers || {};
    if (json !== undefined) {
        config.method = config.method || 'POST';
        config.headers['Content-Type'] = 'application/json';
        config.body = JSON.stringify(json);
    }
    try {
        const resposta = await fetch(API + caminho, config);
        let dados;
        try { dados = await resposta.json(); }
        catch (e) { dados = { sucesso: false, mensagem: 'Resposta inválida do servidor.' }; }
        dados.http = resposta.status;
        return dados;
    } catch (erro) {
        return { sucesso: false, mensagem: 'Servidor offline ou erro de conexão.', http: 0 };
    }
}

// ---------- Formatações ----------
function escapar(texto) {
    return String(texto ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatarPreco(valor) {
    return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(texto) {
    if (!texto) return '-';
    const d = new Date(String(texto).includes('T') ? texto : String(texto).replace(' ', 'T'));
    return isNaN(d) ? '-' : d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const ROTULOS = {
    aguardando_pagamento: 'Aguardando pagamento', pago: 'Pago', enviado: 'Enviado', entregue: 'Entregue', cancelado: 'Cancelado',
    devolvido_parcial: 'Devolvido parcialmente', devolvido: 'Devolvido',
    solicitada: 'Em análise', aprovada: 'Aprovada', recusada: 'Recusada',
    cliente: 'Cliente', admin: 'Funcionário (administrador)', ambos: 'Cliente e funcionário',
    pix: 'PIX', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito', boleto: 'Boleto'
};

function rotulo(chave) { return ROTULOS[chave] || chave; }
function etiquetaStatus(chave) { return `<span class="status status-${escapar(chave)}">${escapar(rotulo(chave))}</span>`; }

function mostrarMsg(idElemento, texto, tipo = 'erro') {
    const el = document.getElementById(idElemento);
    if (!el) return;
    el.className = `msg msg-${tipo}`;
    el.textContent = texto;
    el.style.display = 'block';
}

function toast(texto) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = texto;
    el.classList.add('mostrar');
    setTimeout(() => el.classList.remove('mostrar'), 2200);
}

// ---------- Usuário logado ----------
// funcionário = perfil 'admin' ou 'ambos' (cliente e funcionário)
function ehAdmin(usuario) {
    return !!usuario && ['admin', 'ambos'].includes(usuario.perfil_usuario);
}

async function carregarUsuario() {
    const dados = await api('/auth/eu');
    usuarioAtual = dados.logado ? dados.usuario : null;
    desenharAreaUsuario();
    atualizarBadgeCarrinho();
    return usuarioAtual;
}

function desenharAreaUsuario() {
    const el = document.getElementById('areaUsuario');
    if (!el) return;
    if (!usuarioAtual) {
        el.innerHTML = '<a href="/frontend/login/login.html">Entre</a> ou <a href="/frontend/cadastro/cadastro.html">cadastre-se</a>';
        return;
    }
    const primeiroNome = escapar(usuarioAtual.nome_usuario.split(' ')[0]);
    const painel = ehAdmin(usuarioAtual)
        ? ' <a href="/frontend/admin/admin.html">Painel</a>' : '';
    el.innerHTML = `Olá, <strong>${primeiroNome}</strong>${painel} <button class="botao-sair" onclick="sair()">Sair</button>`;
}

async function sair() {
    await api('/auth/logout', { method: 'POST' });
    location.href = '/frontend/inicio/inicio.html';
}

// Páginas do cliente que exigem login
async function exigirLogin() {
    const usuario = await carregarUsuario();
    if (!usuario) {
        location.href = '/frontend/login/login.html?voltar=' + encodeURIComponent(location.pathname);
        return null;
    }
    return usuario;
}

// Páginas do administrador
async function exigirAdmin() {
    const usuario = await carregarUsuario();
    if (!ehAdmin(usuario)) {
        location.href = '/frontend/login/login.html?admin=1';
        return null;
    }
    return usuario;
}

// ---------- Carrinho (fica no navegador: localStorage) ----------
function lerCarrinho() {
    try { return JSON.parse(localStorage.getItem(CHAVE_CARRINHO)) || []; }
    catch (e) { return []; }
}

function salvarCarrinho(carrinho) {
    localStorage.setItem(CHAVE_CARRINHO, JSON.stringify(carrinho));
    atualizarBadgeCarrinho();
}

function quantidadeNoCarrinho(id) {
    const item = lerCarrinho().find(i => i.id_periferico === id);
    return item ? item.quantidade : 0;
}

function adicionarAoCarrinho(id, quantidade = 1) {
    const carrinho = lerCarrinho();
    const item = carrinho.find(i => i.id_periferico === id);
    if (item) item.quantidade += quantidade;
    else carrinho.push({ id_periferico: id, quantidade });
    salvarCarrinho(carrinho);
}

function atualizarBadgeCarrinho() {
    const el = document.getElementById('qtdCarrinho');
    if (el) el.textContent = lerCarrinho().reduce((soma, i) => soma + i.quantidade, 0);
}

// ---------- Espaços para imagens (banners, promoções e mascote) ----------
// Cada <div class="slot-imagem" data-img="arquivo.jpg"> procura o arquivo em  imagens/site/arquivo.jpg
// Se o arquivo existir, a imagem aparece; se não existir, aparece o aviso "TROQUE AQUI" com o nome certo.
function prepararSlots() {
    document.querySelectorAll('.slot-imagem').forEach(slot => {
        if (slot.dataset.pronto) return;
        slot.dataset.pronto = '1';
        const arquivo = slot.dataset.img;
        const nome = slot.dataset.nome || arquivo;
        const tamanho = slot.dataset.tam || '';
        const img = new Image();
        img.alt = nome;
        img.onload = () => { slot.classList.add('slot-preenchido'); slot.innerHTML = ''; slot.appendChild(img); };
        img.onerror = () => {
            slot.classList.add('slot-vazio');
            slot.innerHTML = `<div class="slot-aviso"><strong>🖼️ TROQUE AQUI</strong><span>${escapar(nome)}</span><code>imagens/site/${escapar(arquivo)}</code><small>Tamanho sugerido: ${escapar(tamanho)}</small></div>`;
        };
        img.src = '/imagens/site/' + arquivo;
    });
}

// ---------- Busca do cabeçalho ----------
function buscarTopo(evento) {
    evento.preventDefault();
    const termo = document.getElementById('campoBuscaTopo').value.trim();
    location.href = '/frontend/produtos/produtos.html' + (termo ? '?busca=' + encodeURIComponent(termo) : '');
}

// ---------- Menu de departamentos (categorias do banco) ----------
async function carregarDepartamentos() {
    const el = document.getElementById('departamentos');
    if (!el) return;
    const dados = await api('/categoria/listar');
    if (dados.sucesso) {
        el.innerHTML = dados.categorias
            .map(c => `<a href="/frontend/produtos/produtos.html?categoria=${c.id_categoria}">${escapar(c.nome_categoria)}</a>`).join('');
    }
}

// ---------- PIX: bloco com QR Code + copia e cola ----------
function htmlPix(pix, valor, idCampo) {
    return `<div class="pix-box">
        <span class="pix-valor">${formatarPreco(valor)}</span>
        <img src="${pix.qr_code}" alt="QR Code do PIX">
        <textarea id="${idCampo}" readonly>${escapar(pix.copia_e_cola)}</textarea>
        <button type="button" class="botao" onclick="copiarTexto('${idCampo}')">Copiar código PIX</button>
        <span class="nota-pequena">No app do seu banco, escolha pagar com PIX e leia o QR Code ou cole o código acima.</span>
    </div>`;
}

async function copiarTexto(idCampo) {
    const campo = document.getElementById(idCampo);
    campo.select();
    try { await navigator.clipboard.writeText(campo.value); }
    catch (erro) { document.execCommand('copy'); }
    toast('Código PIX copiado!');
}

prepararSlots();
carregarDepartamentos();

// ---------- Login com Google ----------
function carregarScript(src) {
    return new Promise((ok, erro) => {
        const s = document.createElement('script');
        s.src = src; s.async = true;
        s.onload = ok;
        s.onerror = () => erro(new Error('Falha ao carregar ' + src));
        document.head.appendChild(s);
    });
}

function avisoGoogleDesativado() {
    mostrarMsg('msg', 'O login com Google ainda não foi ativado nesta loja (falta o GOOGLE_CLIENT_ID no .env). Use o formulário.', 'info');
}

// Mostra o botão do Google dentro do elemento #idContainer.
//  modo 'padrao' = botão grande "Continuar com o Google" | modo 'icone' = só o "G" (cadastro)
//  aoTerminar(resposta) recebe a resposta de POST /auth/google ({ sucesso, usuario, mensagem })
async function prepararGoogle(idContainer, modo, aoTerminar) {
    const el = document.getElementById(idContainer);
    if (!el) return;

    const config = await api('/auth/config');
    if (!config.google_client_id) {
        // Google não configurado: botão simples que explica como ativar
        el.innerHTML = modo === 'icone'
            ? '<button type="button" class="botao-google botao-google-topo" onclick="avisoGoogleDesativado()">Google</button>'
            : '<button type="button" class="botao-google" onclick="avisoGoogleDesativado()">Continuar com o Google</button>';
        return;
    }

    try {
        await carregarScript('https://accounts.google.com/gsi/client');
    } catch (erro) {
        el.innerHTML = '<span class="nota-pequena">Não foi possível carregar o login do Google (verifique a internet).</span>';
        return;
    }

    google.accounts.id.initialize({
        client_id: config.google_client_id,
        callback: async (resposta) => {
            // o Google devolve um token assinado; o SERVIDOR é quem confere se ele é verdadeiro
            aoTerminar(await api('/auth/google', { json: { credential: resposta.credential } }));
        }
    });

    const largura = Math.max(200, Math.min(360, Math.floor(el.clientWidth || 300)));
    google.accounts.id.renderButton(el, modo === 'icone'
        ? { type: 'icon', shape: 'circle', theme: 'outline', size: 'large' }
        : { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', locale: 'pt-BR', width: largura });
}
