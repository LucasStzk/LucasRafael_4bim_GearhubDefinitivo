// Admin: analisar devoluções (aprovar devolve ao estoque e gera reembolso; recusar só registra)

async function iniciar() {
    if (!(await exigirAdmin())) return;
    carregar();
}

async function carregar() {
    const area = document.getElementById('listaDevolucoes');
    const status = document.getElementById('filtroStatus').value;
    const r = await api('/devolucao/listar' + (status ? '?status=' + status : ''));
    if (!r.sucesso) { area.innerHTML = escapar(r.mensagem); return; }
    if (r.devolucoes.length === 0) { area.innerHTML = '<p class="vazio-lista">Nenhuma devolução nesta lista.</p>'; return; }

    area.innerHTML = `<div style="overflow-x:auto"><table class="tabela"><thead><tr>
        <th>#</th><th>Pedido</th><th>Cliente</th><th>Produto</th><th class="centro">Qtd</th><th>Motivo</th><th>Solicitada em</th><th>Status</th><th>Análise</th>
        </tr></thead><tbody>` +
        r.devolucoes.map(d => {
            const analise = d.status_devolucao === 'solicitada'
                ? `<div class="linha-resposta">
                       <input type="text" id="resp-${d.id_devolucao}" placeholder="Resposta ao cliente (opcional)">
                       <button class="botao botao-pequeno" onclick="decidir(${d.id_devolucao}, 'aprovada')">Aprovar</button>
                       <button class="botao botao-perigo botao-pequeno" onclick="decidir(${d.id_devolucao}, 'recusada')">Recusar</button>
                   </div>`
                : `${d.status_devolucao === 'aprovada' ? 'Reembolso: ' + formatarPreco(d.valor_reembolso_devolucao) + '<br>' : ''}
                   <span class="nota-pequena">${escapar(d.resposta_devolucao || '')}</span>`;
            return `<tr>
                <td>${d.id_devolucao}</td><td>#${d.id_pedido}</td>
                <td>${escapar(d.nome_usuario)}</td><td>${escapar(d.nome_periferico)}</td>
                <td class="centro">${d.quantidade_devolucao}</td><td>${escapar(d.motivo_devolucao)}</td>
                <td>${formatarData(d.data_solicitacao_devolucao)}</td>
                <td>${etiquetaStatus(d.status_devolucao)}</td><td>${analise}</td></tr>`;
        }).join('') + '</tbody></table></div>';
}

async function decidir(id, decisao) {
    const resposta = document.getElementById(`resp-${id}`).value;
    const r = await api(`/devolucao/${id}/decidir`, { method: 'PUT', json: { decisao, resposta_devolucao: resposta } });
    mostrarMsg('msg', r.mensagem, r.sucesso ? 'ok' : 'erro');
    carregar();
}

iniciar();
