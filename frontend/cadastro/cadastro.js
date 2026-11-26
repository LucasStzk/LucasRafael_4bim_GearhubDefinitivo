// Cadastro de cliente (o servidor sempre cria perfil "cliente" e já deixa a pessoa logada)

async function iniciar() {
    const usuario = await carregarUsuario();
    if (usuario) location.href = '/frontend/inicio/inicio.html';
}

async function cadastrar(evento) {
    evento.preventDefault();
    const senha = document.getElementById('senha').value;
    const confirmar = document.getElementById('confirmarSenha').value;

    if (senha !== confirmar) {
        mostrarMsg('msg', 'As senhas não conferem.', 'erro');
        return;
    }

    const dados = await api('/auth/cadastro', {
        json: {
            nome_usuario: document.getElementById('nome').value,
            email_usuario: document.getElementById('email').value,
            senha_usuario: senha,
            confirmar_senha: confirmar
        }
    });

    if (!dados.sucesso) {
        mostrarMsg('msg', dados.mensagem, 'erro');
        return;
    }
    mostrarMsg('msg', 'Cadastro realizado! Redirecionando...', 'ok');
    const voltar = new URLSearchParams(location.search).get('voltar');
    location.href = voltar && voltar.startsWith('/frontend/') ? voltar : '/frontend/inicio/inicio.html';
}

// Botão do Google (só o "G"): cria a conta ou entra, se o e-mail já existir
prepararGoogle('botaoGoogle', 'icone', resposta => {
    if (!resposta.sucesso) { mostrarMsg('msg', resposta.mensagem, 'erro'); return; }
    mostrarMsg('msg', 'Login realizado! Redirecionando...', 'ok');
    const voltar = new URLSearchParams(location.search).get('voltar');
    location.href = voltar && voltar.startsWith('/frontend/') ? voltar : '/frontend/inicio/inicio.html';
});

iniciar();
