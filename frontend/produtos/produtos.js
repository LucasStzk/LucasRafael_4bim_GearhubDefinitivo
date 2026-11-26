// Vitrine de produtos: busca, filtro por categoria, ficha técnica (1:1) e carrinho

let todosPerifericos = [];

async function iniciar() {
    await carregarUsuario();

    const [rp, rc] = await Promise.all([api('/periferico/listar'), api('/categoria/listar')]);
    if (!rp.sucesso) {
        document.getElementById('vitrine').innerHTML = `<p class="vazio">${escapar(rp.mensagem)}</p>`;
        return;
    }

    const select = document.getElementById('selectCategoria');
    rc.categorias.forEach(c => {
        select.innerHTML += `<option value="${c.id_categoria}">${escapar(c.nome_categoria)}</option>`;
    });

    // vindo dos círculos da página inicial: produtos.html?categoria=3
    const categoriaUrl = new URLSearchParams(location.search).get('categoria');
    if (categoriaUrl) select.value = categoriaUrl;

    // vindo da busca do cabeçalho: produtos.html?busca=mouse
    const buscaUrl = new URLSearchParams(location.search).get('busca');
    if (buscaUrl) document.getElementById('inputBusca').value = buscaUrl;

    todosPerifericos = rp.perifericos;
    filtrar();
}

function filtrar() {
    const busca = document.getElementById('inputBusca').value.toLowerCase();
    const categoria = document.getElementById('selectCategoria').value;

    const lista = todosPerifericos.filter(p =>
        (!categoria || String(p.id_categoria) === categoria) &&
        (p.nome_periferico.toLowerCase().includes(busca) || p.nome_fabricante.toLowerCase().includes(busca))
    );

    const vitrine = document.getElementById('vitrine');
    if (lista.length === 0) {
        vitrine.innerHTML = '<p class="vazio">Nenhum periférico encontrado.</p>';
        return;
    }

    vitrine.innerHTML = lista.map(p => {
        const semEstoque = p.quantidade_estoque_periferico <= 0;
        return `
        <article class="produto-card">
            <img src="/imagens/${p.id_periferico}.png" alt="${escapar(p.nome_periferico)}"
                 onerror="this.onerror=null; this.src='${IMG_PADRAO}'">
            <div class="produto-info">
                <span class="etiqueta">${escapar(p.nome_categoria)}</span>
                <h3>${escapar(p.nome_periferico)}</h3>
                <span class="fabricante">${escapar(p.nome_fabricante)}</span>
                <span class="estoque">${semEstoque ? 'Indisponível' : p.quantidade_estoque_periferico + ' em estoque'}</span>
                <span class="preco">${formatarPreco(p.preco_periferico)}</span>
                <div class="detalhes-tecnicos" id="detalhes-${p.id_periferico}"></div>
            </div>
            <button class="botao botao-neutro botao-pequeno" onclick="verEspecificacao(${p.id_periferico})">Ficha técnica</button>
            <button class="botao" onclick="comprar(${p.id_periferico})" ${semEstoque ? 'disabled' : ''}>
                ${semEstoque ? 'Sem estoque' : '🛒 Adicionar ao carrinho'}
            </button>
        </article>`;
    }).join('');
}

function comprar(id) {
    const produto = todosPerifericos.find(p => p.id_periferico === id);
    if (quantidadeNoCarrinho(id) + 1 > produto.quantidade_estoque_periferico) {
        toast('Você já colocou todo o estoque disponível no carrinho.');
        return;
    }
    adicionarAoCarrinho(id, 1);
    toast(`"${produto.nome_periferico}" adicionado ao carrinho!`);
}

// Ficha técnica: busca a especificação (relação 1:1) e mostra/esconde no card
async function verEspecificacao(id) {
    const div = document.getElementById(`detalhes-${id}`);
    if (div.classList.contains('aberto')) {
        div.classList.remove('aberto');
        return;
    }
    const data = await api(`/especificacao/${id}`);
    if (data.sucesso) {
        const e = data.especificacao;
        div.innerHTML = `<b>Conexão:</b> ${escapar(e.conexao_especificacao)}<br>
            <b>Garantia:</b> ${e.garantia_meses_especificacao} meses<br>
            <b>Peso:</b> ${e.peso_gramas_especificacao} g<br>
            <b>RGB:</b> ${e.iluminacao_rgb_especificacao ? 'Sim' : 'Não'}<br>
            ${escapar(e.detalhes_especificacao)}`;
    } else {
        div.innerHTML = 'Este periférico ainda não possui ficha técnica.';
    }
    div.classList.add('aberto');
}

iniciar();
