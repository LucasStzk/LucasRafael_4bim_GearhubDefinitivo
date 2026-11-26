// Carrinho (guardado no navegador) + finalização da compra

let catalogo = {};   // id -> periférico (preço e estoque vêm do servidor)

async function iniciar() {
    await carregarUsuario();
    const r = await api('/periferico/listar');
    if (!r.sucesso) {
        document.getElementById('itensCarrinho').innerHTML = `<p class="vazio-lista">${escapar(r.mensagem)}</p>`;
        return;
    }
    r.perifericos.forEach(p => { catalogo[p.id_periferico] = p; });
    desenhar();

    // voltou do login (carrinho.html?pagamento=1): já abre a etapa de pagamento
    if (new URLSearchParams(location.search).get('pagamento') === '1' && usuarioAtual && lerCarrinho().length > 0) {
        irParaPagamento();
    }
}

// Botão PAGAMENTO: se não estiver logado vai para o login; se estiver, mostra a escolha da forma de pagamento
function irParaPagamento() {
    if (!usuarioAtual) {
        location.href = '/frontend/login/login.html?voltar=' + encodeURIComponent('/frontend/carrinho/carrinho.html?pagamento=1');
        return;
    }
    const area = document.getElementById('areaPagamento');
    area.style.display = 'block';
    area.scrollIntoView({ behavior: 'smooth' });
}

// Mantém só produtos que ainda existem e limita a quantidade ao estoque
function carrinhoValido() {
    const limpo = lerCarrinho()
        .filter(i => catalogo[i.id_periferico] && catalogo[i.id_periferico].quantidade_estoque_periferico > 0)
        .map(i => ({ ...i, quantidade: Math.min(i.quantidade, catalogo[i.id_periferico].quantidade_estoque_periferico) }));
    salvarCarrinho(limpo);
    return limpo;
}

function desenhar() {
    const carrinho = carrinhoValido();
    const area = document.getElementById('itensCarrinho');
    const resumo = document.getElementById('areaResumo');

    if (carrinho.length === 0) {
        area.innerHTML = `
            <!-- MASCOTE (carrinho vazio): imagens/site/mascote-vazio.png -->
            <div class="slot-imagem slot-mascote-pequeno" data-img="mascote-vazio.png" data-nome="Mascote - carrinho vazio" data-tam="400 × 400 px (PNG transparente)"></div>
            <p class="vazio-lista">Seu carrinho está vazio.<br><br>
            <a href="/frontend/produtos/produtos.html">Ver produtos</a></p>`;
        prepararSlots();
        resumo.style.display = 'none';
        document.getElementById('areaPagamento').style.display = 'none';
        return;
    }
    resumo.style.display = 'block';

    let total = 0;
    let html = `<table class="tabela"><thead><tr><th></th><th>Produto</th><th>Preço</th><th>Qtd</th><th>Subtotal</th><th></th></tr></thead><tbody>`;
    carrinho.forEach(item => {
        const p = catalogo[item.id_periferico];
        const subtotal = Number(p.preco_periferico) * item.quantidade;
        total += subtotal;
        html += `<tr>
            <td><img class="mini" src="/imagens/${p.id_periferico}.png" alt="" onerror="this.onerror=null; this.src='${IMG_PADRAO}'"></td>
            <td>${escapar(p.nome_periferico)}</td>
            <td>${formatarPreco(p.preco_periferico)}</td>
            <td><span class="qtd-controle">
                <button onclick="alterarQuantidade(${p.id_periferico}, -1)">-</button>
                ${item.quantidade}
                <button onclick="alterarQuantidade(${p.id_periferico}, 1)">+</button>
            </span></td>
            <td>${formatarPreco(subtotal)}</td>
            <td><button class="botao botao-perigo botao-pequeno" onclick="removerItem(${p.id_periferico})">Remover</button></td>
        </tr>`;
    });
    html += '</tbody></table>';
    area.innerHTML = html;
    document.getElementById('totalCarrinho').textContent = formatarPreco(total);
}

function alterarQuantidade(id, delta) {
    const carrinho = lerCarrinho();
    const item = carrinho.find(i => i.id_periferico === id);
    const maximo = Math.min(99, catalogo[id].quantidade_estoque_periferico);
    const nova = item.quantidade + delta;
    if (nova < 1) return;
    if (nova > maximo) { toast('Quantidade máxima disponível em estoque.'); return; }
    item.quantidade = nova;
    salvarCarrinho(carrinho);
    desenhar();
}

function removerItem(id) {
    salvarCarrinho(lerCarrinho().filter(i => i.id_periferico !== id));
    desenhar();
}

async function finalizar() {
    if (!usuarioAtual) {
        location.href = '/frontend/login/login.html?voltar=' + encodeURIComponent('/frontend/carrinho/carrinho.html?pagamento=1');
        return;
    }

    const endereco = document.getElementById('endereco').value.trim();
    const escolhido = document.querySelector('input[name="pagamento"]:checked');
    if (endereco.length < 5) { mostrarMsg('msg', 'Informe o endereço de entrega.', 'erro'); return; }
    if (!escolhido) { mostrarMsg('msg', 'Escolha a forma de pagamento.', 'erro'); return; }

    const botao = document.getElementById('btFinalizar');
    botao.disabled = true;

    // só mandamos ID e quantidade: o preço é conferido no servidor
    const dados = await api('/pedido', {
        json: {
            itens: lerCarrinho().map(i => ({ id_periferico: i.id_periferico, quantidade: i.quantidade })),
            forma_pagamento_pedido: escolhido.value,
            endereco_entrega_pedido: endereco
        }
    });
    botao.disabled = false;

    if (!dados.sucesso) {
        mostrarMsg('msg', dados.mensagem, 'erro');
        return;
    }

    salvarCarrinho([]);
    document.getElementById('conteudoCarrinho').style.display = 'none';
    const conf = document.getElementById('areaConfirmacao');
    conf.style.display = 'block';
    if (dados.status_pedido === 'aguardando_pagamento') {
        // PIX real: o pedido só segue depois que a loja confirmar o recebimento
        conf.innerHTML = `
            <h2>🧾 Pedido #${dados.id_pedido} criado!</h2>
            <p>Falta só pagar o PIX abaixo. Assim que a loja confirmar o recebimento, o pedido segue para envio.</p>
            ${dados.pix ? htmlPix(dados.pix, dados.valor_total_pedido, 'codigoPix') :
              '<p class="nota-pequena">Não foi possível gerar o QR Code agora. Abra "Meus pedidos" e clique em "Ver PIX para pagar".</p>'}
            <br><a href="/frontend/meus_pedidos/meus_pedidos.html">Ver meus pedidos</a>`;
    } else {
        conf.innerHTML = `
            <h2>✅ Pedido #${dados.id_pedido} realizado!</h2>
            <p>Pagamento de <strong>${formatarPreco(dados.valor_total_pedido)}</strong> via <strong>${escapar(rotulo(escolhido.value))}</strong> confirmado (simulação).</p>
            <p class="nota-pequena">Acompanhe o andamento e solicite devoluções em "Meus pedidos".</p>
            <br><a href="/frontend/meus_pedidos/meus_pedidos.html">Ver meus pedidos</a>`;
    }
}

iniciar();
