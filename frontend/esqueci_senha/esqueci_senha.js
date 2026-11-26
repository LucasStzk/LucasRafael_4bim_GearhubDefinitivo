// Pede o link de redefinição de senha por e-mail

async function iniciar() {
    await carregarUsuario();
}

async function enviar(evento) {
    evento.preventDefault();
    const botao = document.getElementById('btEnviar');
    botao.disabled = true;

    const r = await api('/auth/esqueci-senha', { json: { email_usuario: document.getElementById('email').value } });
    botao.disabled = false;
    mostrarMsg('msg', r.mensagem, r.sucesso ? 'ok' : 'erro');
}

iniciar();
