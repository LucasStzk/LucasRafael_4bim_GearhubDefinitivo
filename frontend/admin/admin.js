// Painel do administrador: números gerais

async function iniciar() {
    if (!(await exigirAdmin())) return;

    const r = await api('/admin/resumo');
    if (!r.sucesso) { document.getElementById('numeros').innerHTML = escapar(r.mensagem); return; }
    const s = r.resumo;

    document.getElementById('numeros').innerHTML = `
        <div class="numero-card"><strong>${formatarPreco(s.vendas_liquidas)}</strong>vendas líquidas (já sem devoluções)</div>
        <div class="numero-card"><strong>${s.clientes}</strong>clientes</div>
        <div class="numero-card"><strong>${s.perifericos}</strong>periféricos</div>
        <div class="numero-card ${s.estoque_baixo > 0 ? 'alerta' : ''}"><strong>${s.estoque_baixo}</strong>com estoque baixo (&lt; 10)</div>
        <div class="numero-card ${s.devolucoes_pendentes > 0 ? 'alerta' : ''}"><strong>${s.devolucoes_pendentes}</strong>devoluções em análise</div>`;

    document.getElementById('porStatus').innerHTML = s.pedidos_por_status.length
        ? s.pedidos_por_status.map(x => `<div><strong>${x.total}</strong>${escapar(rotulo(x.status_pedido))}</div>`).join('')
        : '<p>Nenhum pedido ainda.</p>';
}

iniciar();
