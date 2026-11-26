// Meus pedidos + devolução de itens (individual, vários ou todos)

async function iniciar() {
    if (!(await exigirLogin())) return;
    await Promise.all([carregarPedidos(), carregarDevolucoes()]);
}

async function carregarPedidos() {
    const area = document.getElementById('listaPedidos');
    const r = await api('/pedido/meus');
    if (!r.sucesso) { area.innerHTML = `<p class="vazio-lista">${escapar(r.mensagem)}</p>`; return; }
    if (r.pedidos.length === 0) {
        area.innerHTML = `
            <!-- MASCOTE (sem pedidos): imagens/site/mascote-vazio.png -->
            <div class="slot-imagem slot-mascote-pequeno" data-img="mascote-vazio.png" data-nome="Mascote - sem pedidos" data-tam="400 × 400 px (PNG transparente)"></div>
            <p class="vazio-lista">Você ainda não fez nenhum pedido. <a href="/frontend/produtos/produtos.html">Ver produtos</a></p>`;
        prepararSlots();
        return;
    }
    area.innerHTML = r.pedidos.map(desenharPedido).join('');
}

function podeDevolver(pedido) {
    return ['entregue', 'devolvido_parcial'].includes(pedido.status_pedido)
        && pedido.itens.some(i => i.quantidade_disponivel_item > 0);
}

function desenharPedido(p) {
    const devolver = podeDevolver(p);

    const linhas = p.itens.map(i => {
        let celulaDevolver = '<span class="nota-pequena">-</span>';
        if (devolver) {
            if (i.quantidade_disponivel_item > 0) {
                const opcoes = Array.from({ length: i.quantidade_disponivel_item }, (_, k) => `<option value="${k + 1}">${k + 1}</option>`).join('');
                celulaDevolver = `<label><input type="checkbox" id="chk-${i.id_item_pedido}"> devolver
                    <select id="qtd-${i.id_item_pedido}">${opcoes}</select></label>`;
            } else {
                celulaDevolver = '<span class="nota-pequena">Nada a devolver</span>';
            }
        }
        return `<tr>
            <td>${escapar(i.nome_periferico)}</td>
            <td class="centro">${i.quantidade_item}</td>
            <td>${formatarPreco(i.preco_unitario_item)}</td>
            <td class="centro">${i.quantidade_devolvida_item}</td>
            <td class="centro">${i.quantidade_pendente_item}</td>
            ${devolver ? `<td>${celulaDevolver}</td>` : ''}
        </tr>`;
    }).join('');

    const areaPix = (p.status_pedido === 'aguardando_pagamento' && p.forma_pagamento_pedido === 'pix') ? `
        <div class="area-devolucao">
            <strong>Pagamento pendente (PIX)</strong>
            <p class="nota-pequena">Pague o PIX para a loja confirmar o seu pedido.</p>
            <button class="botao" onclick="mostrarPix(${p.id_pedido})">Ver PIX para pagar</button>
            <div id="pix-${p.id_pedido}"></div>
        </div>` : '';

    const areaDevolucao = devolver ? `
        <div class="area-devolucao">
            <strong>Devolver itens deste pedido</strong>
            <p class="nota-pequena">Marque os itens (e a quantidade) que deseja devolver, ou devolva tudo que ainda resta.</p>
            <input type="text" id="motivo-${p.id_pedido}" placeholder="Motivo da devolução (obrigatório)">
            <div class="acoes-linha">
                <button class="botao" onclick="devolverSelecionados(${p.id_pedido})">Devolver selecionados</button>
                <button class="botao botao-neutro" onclick="devolverTodos(${p.id_pedido})">Devolver todos</button>
            </div>
            <div id="msg-${p.id_pedido}" class="msg"></div>
        </div>`
        : (p.status_pedido === 'pago' || p.status_pedido === 'enviado'
            ? '<p class="nota-pequena">A devolução fica disponível depois que o pedido for entregue.</p>' : '');

    return `
    <article class="pedido-card" id="pedido-${p.id_pedido}">
        <div class="pedido-topo">
            <h3>Pedido #${p.id_pedido}</h3>
            ${etiquetaStatus(p.status_pedido)}
        </div>
        <div class="pedido-meta">
            ${formatarData(p.data_pedido)} · ${escapar(rotulo(p.forma_pagamento_pedido))}<br>
            Entrega: ${escapar(p.endereco_entrega_pedido)}<br>
            Total: <strong>${formatarPreco(p.valor_total_pedido)}</strong>
        </div>
        <div style="overflow-x:auto">
        <table class="tabela">
            <thead><tr><th>Produto</th><th class="centro">Qtd</th><th>Preço un.</th><th class="centro">Devolvidos</th><th class="centro">Em análise</th>${devolver ? '<th>Devolução</th>' : ''}</tr></thead>
            <tbody>${linhas}</tbody>
        </table>
        </div>
        ${areaPix}
        ${areaDevolucao}
    </article>`;
}

// Reabre o QR Code / copia e cola de um pedido PIX ainda não pago
async function mostrarPix(idPedido) {
    const alvo = document.getElementById(`pix-${idPedido}`);
    const r = await api(`/pedido/${idPedido}/pix`);
    if (!r.sucesso) {
        alvo.innerHTML = `<div class="msg msg-erro" style="display:block">${escapar(r.mensagem)}</div>`;
        return;
    }
    alvo.innerHTML = htmlPix(r, r.valor_total_pedido, `codigoPix-${idPedido}`);
}

async function enviarDevolucao(idPedido, itens) {
    const motivo = document.getElementById(`motivo-${idPedido}`).value.trim();
    if (itens.length === 0) { mostrarMsg(`msg-${idPedido}`, 'Selecione pelo menos um item.', 'erro'); return; }
    if (motivo.length < 3) { mostrarMsg(`msg-${idPedido}`, 'Informe o motivo da devolução.', 'erro'); return; }

    const r = await api('/devolucao', { json: { id_pedido: idPedido, motivo_devolucao: motivo, itens } });
    if (!r.sucesso) { mostrarMsg(`msg-${idPedido}`, r.mensagem, 'erro'); return; }

    toast('Devolução solicitada!');
    await Promise.all([carregarPedidos(), carregarDevolucoes()]);
}

// Só os itens marcados, cada um com a quantidade escolhida
async function devolverSelecionados(idPedido) {
    const r = await api('/pedido/' + idPedido);
    if (!r.sucesso) return;
    const itens = r.pedido.itens
        .filter(i => document.getElementById(`chk-${i.id_item_pedido}`)?.checked)
        .map(i => ({ id_item_pedido: i.id_item_pedido, quantidade: Number(document.getElementById(`qtd-${i.id_item_pedido}`).value) }));
    await enviarDevolucao(idPedido, itens);
}

// Tudo o que ainda resta devolver no pedido
async function devolverTodos(idPedido) {
    const r = await api('/pedido/' + idPedido);
    if (!r.sucesso) return;
    const itens = r.pedido.itens
        .filter(i => i.quantidade_disponivel_item > 0)
        .map(i => ({ id_item_pedido: i.id_item_pedido, quantidade: i.quantidade_disponivel_item }));
    await enviarDevolucao(idPedido, itens);
}

async function carregarDevolucoes() {
    const area = document.getElementById('listaDevolucoes');
    const r = await api('/devolucao/minhas');
    if (!r.sucesso) { area.innerHTML = escapar(r.mensagem); return; }
    if (r.devolucoes.length === 0) { area.innerHTML = '<p class="vazio-lista">Você não tem devoluções.</p>'; return; }

    area.innerHTML = `<div style="overflow-x:auto"><table class="tabela"><thead><tr>
        <th>#</th><th>Pedido</th><th>Produto</th><th class="centro">Qtd</th><th>Motivo</th><th>Status</th><th>Reembolso</th><th>Resposta da loja</th>
        </tr></thead><tbody>` +
        r.devolucoes.map(d => `<tr>
            <td>${d.id_devolucao}</td><td>#${d.id_pedido}</td><td>${escapar(d.nome_periferico)}</td>
            <td class="centro">${d.quantidade_devolucao}</td><td>${escapar(d.motivo_devolucao)}</td>
            <td>${etiquetaStatus(d.status_devolucao)}</td>
            <td>${d.status_devolucao === 'aprovada' ? formatarPreco(d.valor_reembolso_devolucao) : '-'}</td>
            <td>${escapar(d.resposta_devolucao || '-')}</td></tr>`).join('') +
        '</tbody></table></div>';
}

iniciar();
