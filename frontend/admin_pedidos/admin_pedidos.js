// Admin: acompanhar pedidos e mudar o status (pago -> enviado -> entregue / cancelar)

// Próximos status permitidos (o servidor valida de novo)
const PROXIMOS = {
    aguardando_pagamento: [['pago', 'Confirmar pagamento'], ['cancelado', 'Cancelar']],
    pago: [['enviado', 'Marcar como enviado'], ['cancelado', 'Cancelar']],
    enviado: [['entregue', 'Marcar como entregue'], ['cancelado', 'Cancelar']]
};

async function iniciar() {
    if (!(await exigirAdmin())) return;
    carregar();
}

async function carregar() {
    const area = document.getElementById('listaPedidos');
    const status = document.getElementById('filtroStatus').value;
    const r = await api('/pedido/listar' + (status ? '?status=' + status : ''));
    if (!r.sucesso) { area.innerHTML = escapar(r.mensagem); return; }
    if (r.pedidos.length === 0) { area.innerHTML = '<p class="vazio-lista">Nenhum pedido encontrado.</p>'; return; }

    area.innerHTML = `<div style="overflow-x:auto"><table class="tabela"><thead><tr>
        <th>#</th><th>Cliente</th><th>Data</th><th>Itens</th><th>Pagamento</th><th>Total</th><th>Status</th><th>Ações</th>
        </tr></thead><tbody>` +
        r.pedidos.map(p => {
            const itens = p.itens.map(i => `${i.quantidade_item}x ${escapar(i.nome_periferico)}`).join('<br>');
            const acoes = (PROXIMOS[p.status_pedido] || []).map(([novo, texto]) =>
                `<button class="botao botao-pequeno ${novo === 'cancelado' ? 'botao-perigo' : ''}"
                         onclick="mudarStatus(${p.id_pedido}, '${novo}')">${texto}</button>`).join(' ') || '<span class="nota-pequena">-</span>';
            return `<tr>
                <td>${p.id_pedido}</td>
                <td>${escapar(p.nome_usuario)}<br><span class="nota-pequena">${escapar(p.email_usuario)}</span></td>
                <td>${formatarData(p.data_pedido)}</td>
                <td>${itens}</td>
                <td>${escapar(rotulo(p.forma_pagamento_pedido))}</td>
                <td>${formatarPreco(p.valor_total_pedido)}</td>
                <td>${etiquetaStatus(p.status_pedido)}</td>
                <td><div class="acoes-linha">${acoes}</div></td></tr>`;
        }).join('') + '</tbody></table></div>';
}

async function mudarStatus(id, novo) {
    if (novo === 'cancelado' && !confirm(`Cancelar o pedido #${id}? Os produtos voltam ao estoque.`)) return;
    const r = await api(`/pedido/${id}/status`, { method: 'PUT', json: { status_pedido: novo } });
    mostrarMsg('msg', r.mensagem, r.sucesso ? 'ok' : 'erro');
    carregar();
}

iniciar();
