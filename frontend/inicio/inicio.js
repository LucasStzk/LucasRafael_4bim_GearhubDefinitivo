// Página inicial da loja: destaques (mais vendidos) e categorias

const ICONES_CATEGORIA = {
    'Teclado': '⌨️', 'Mouse': '🖱️', 'Headset': '🎧', 'Monitor': '🖥️', 'Mousepad': '🖼️',
    'Webcam': '📷', 'Microfone': '🎙️', 'Cadeira Gamer': '💺', 'Gamepad': '🎮', 'Acessórios': '🔌'
};

async function iniciar() {
    await carregarUsuario();

    const [destaques, categorias] = await Promise.all([api('/periferico/destaques'), api('/categoria/listar')]);

    const areaDestaques = document.getElementById('destaques');
    if (destaques.sucesso && destaques.perifericos.length > 0) {
        areaDestaques.innerHTML = destaques.perifericos.map((p, i) => `
            <a class="destaque-card" href="/frontend/produtos/produtos.html?categoria=${p.id_categoria}">
                <span class="faixa">${i === 0 ? '🔥 Mais vendido' : 'Destaque'}</span>
                <img src="/imagens/${p.id_periferico}.png" alt="${escapar(p.nome_periferico)}"
                     onerror="this.onerror=null; this.src='${IMG_PADRAO}'">
                <div class="info">
                    <h3>${escapar(p.nome_periferico)}</h3>
                    <span class="nota-pequena">${escapar(p.nome_fabricante)}</span>
                    <div class="preco">${formatarPreco(p.preco_periferico)}</div>
                </div>
            </a>`).join('');
    } else {
        areaDestaques.innerHTML = '<p class="vazio-lista">Não foi possível carregar os destaques.</p>';
    }

    const areaCategorias = document.getElementById('categorias');
    if (categorias.sucesso) {
        areaCategorias.innerHTML = categorias.categorias.map(c => `
            <a class="categoria-circulo" href="/frontend/produtos/produtos.html?categoria=${c.id_categoria}">
                <span class="bola">${ICONES_CATEGORIA[c.nome_categoria] || '📦'}</span>
                ${escapar(c.nome_categoria)}
            </a>`).join('');
    }
}

iniciar();

// ---------- Carrossel de banners (troca sozinho a cada 6 segundos) ----------
let heroAtual = 0;

function iniciarHero() {
    const slides = document.querySelectorAll('.hero-slide');
    if (!slides.length) return;
    document.getElementById('heroPontos').innerHTML =
        Array.from(slides).map((_, i) => `<button type="button" onclick="irParaHero(${i})" aria-label="Banner ${i + 1}"></button>`).join('');
    irParaHero(0);
    setInterval(() => moverHero(1), 6000);
}

function irParaHero(indice) {
    const slides = document.querySelectorAll('.hero-slide');
    const pontos = document.querySelectorAll('#heroPontos button');
    if (!slides.length) return;
    heroAtual = (indice + slides.length) % slides.length;
    slides.forEach((s, i) => s.classList.toggle('ativo', i === heroAtual));
    pontos.forEach((p, i) => p.classList.toggle('ativo', i === heroAtual));
}

function moverHero(direcao) { irParaHero(heroAtual + direcao); }

iniciarHero();
