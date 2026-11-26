// Login: envia e-mail e senha; o servidor responde com um cookie de sessão

async function iniciar() {
    const usuario = await carregarUsuario();
    if (usuario) irParaDestino(usuario);   // já está logado
}

// Para onde ir depois do login:
//  - veio de outra página (ex.: carrinho)  -> volta para ela (só caminhos internos, por segurança)
//  - só cliente                            -> dashboard do cliente
//  - só funcionário                        -> dashboard do administrador
//  - cliente E funcionário                 -> janela perguntando como quer entrar
function irParaDestino(usuario) {
    const voltar = new URLSearchParams(location.search).get('voltar');
    if (voltar && voltar.startsWith('/frontend/') && !voltar.startsWith('//')) {
        location.href = voltar;
    } else if (usuario.perfil_usuario === 'ambos') {
        document.getElementById('modalEscolha').style.display = 'flex';
    } else if (usuario.perfil_usuario === 'admin') {
        location.href = '/frontend/admin/admin.html';
    } else {
        location.href = '/frontend/inicio/inicio.html';
    }
}

// Botões da janela de escolha
function escolherVisao(visao) {
    location.href = visao === 'admin' ? '/frontend/admin/admin.html' : '/frontend/inicio/inicio.html';
}

async function entrar(evento) {
    evento.preventDefault();
    const dados = await api('/auth/login', {
        json: {
            email_usuario: document.getElementById('email').value,
            senha_usuario: document.getElementById('senha').value
        }
    });

    if (!dados.sucesso) {
        mostrarMsg('msg', dados.mensagem, 'erro');
        return;
    }
    mostrarMsg('msg', 'Login realizado! Redirecionando...', 'ok');
    irParaDestino(dados.usuario);
}

// Botão "Continuar com o Google"
prepararGoogle('botaoGoogle', 'padrao', resposta => {
    if (!resposta.sucesso) { mostrarMsg('msg', resposta.mensagem, 'erro'); return; }
    mostrarMsg('msg', 'Login realizado! Redirecionando...', 'ok');
    irParaDestino(resposta.usuario);
});

iniciar();
