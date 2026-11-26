// Admin: lista de usuários e troca de perfil (cliente <-> admin)

async function iniciar() {
    if (!(await exigirAdmin())) return;
    carregar();
}

async function carregar() {
    const area = document.getElementById('listaUsuarios');
    const r = await api('/usuario/listar');
    if (!r.sucesso) { area.innerHTML = escapar(r.mensagem); return; }

    area.innerHTML = `<div style="overflow-x:auto"><table class="tabela"><thead><tr>
        <th>#</th><th>Nome</th><th>E-mail</th><th>Cadastro</th><th>Perfil</th><th></th></tr></thead><tbody>` +
        r.usuarios.map(u => {
            const eu = usuarioAtual && u.id_usuario === usuarioAtual.id_usuario;
            return `<tr>
                <td>${u.id_usuario}</td><td>${escapar(u.nome_usuario)}${eu ? ' <span class="nota-pequena">(você)</span>' : ''}</td>
                <td>${escapar(u.email_usuario)}</td><td>${formatarData(u.data_cadastro_usuario)}</td>
                <td><select id="perfil-${u.id_usuario}" ${eu ? 'disabled' : ''}>
                    <option value="cliente" ${u.perfil_usuario === 'cliente' ? 'selected' : ''}>Cliente</option>
                    <option value="admin" ${u.perfil_usuario === 'admin' ? 'selected' : ''}>Funcionário (administrador)</option>
                    <option value="ambos" ${u.perfil_usuario === 'ambos' ? 'selected' : ''}>Cliente e funcionário</option>
                </select></td>
                <td>${eu ? '' : `<button class="botao botao-pequeno" onclick="salvarPerfil(${u.id_usuario})">Salvar</button>`}</td></tr>`;
        }).join('') + '</tbody></table></div>';
}

async function salvarPerfil(id) {
    const perfil = document.getElementById(`perfil-${id}`).value;
    const r = await api(`/usuario/${id}/perfil`, { method: 'PUT', json: { perfil_usuario: perfil } });
    mostrarMsg('msg', r.mensagem, r.sucesso ? 'ok' : 'erro');
    carregar();
}

iniciar();
