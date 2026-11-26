// Página aberta pelo link do e-mail: redefinir_senha.html?token=...

const tokenDoLink = new URLSearchParams(location.search).get('token') || '';

async function iniciar() {
    await carregarUsuario();
    if (!/^[0-9a-f]{64}$/.test(tokenDoLink)) {
        document.getElementById('formRedefinir').style.display = 'none';
        mostrarMsg('msg', 'Link inválido. Peça um novo link de redefinição.', 'erro');
    }
}

async function redefinir(evento) {
    evento.preventDefault();
    const senha = document.getElementById('senha').value;
    const confirmar = document.getElementById('confirmarSenha').value;
    if (senha !== confirmar) { mostrarMsg('msg', 'As senhas não conferem.', 'erro'); return; }

    const r = await api('/auth/redefinir-senha', {
        json: { token: tokenDoLink, senha_usuario: senha, confirmar_senha: confirmar }
    });
    if (!r.sucesso) { mostrarMsg('msg', r.mensagem, 'erro'); return; }

    document.getElementById('formRedefinir').style.display = 'none';
    mostrarMsg('msg', r.mensagem + ' Redirecionando para o login...', 'ok');
    setTimeout(() => { location.href = '/frontend/login/login.html'; }, 2000);
}

iniciar();
