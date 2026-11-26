const { query, pool } = require('../database');
const { ehAdmin } = require('../middlewares/auth');
const { gerarPixPedido, pixConfigurado } = require('../services/pix');

// Erro de regra de negócio (vira resposta 400 para o cliente)
class ErroNegocio extends Error {}

const FORMAS_PAGAMENTO = ['pix', 'cartao_credito', 'cartao_debito', 'boleto'];

// Para cada status, quais os próximos status que o administrador pode escolher
const TRANSICOES = {
    aguardando_pagamento: ['pago', 'cancelado'],   // PIX: o funcionário confirma que o dinheiro chegou
    pago: ['enviado', 'cancelado'],
    enviado: ['entregue', 'cancelado']
};

function marcadores(lista, inicio = 1) {
    return lista.map((_, i) => `$${i + inicio}`).join(', ');
}

// Anexa a cada pedido a lista de itens (com quanto já foi devolvido / está pendente)
async function anexarItens(pedidos) {
    if (pedidos.length === 0) return pedidos;
    const ids = pedidos.map(p => p.id_pedido);
    const sql = `
        SELECT i.id_item_pedido, i.id_pedido, i.id_periferico, per.nome_periferico,
               i.quantidade_item, i.preco_unitario_item, i.quantidade_devolvida_item,
               CAST(COALESCE((SELECT SUM(d.quantidade_devolucao)
                              FROM public.devolucao d
                              WHERE d.id_item_pedido = i.id_item_pedido
                                AND d.status_devolucao = 'solicitada'), 0) AS integer) AS quantidade_pendente_item
        FROM public.item_pedido i
        JOIN public.periferico per ON per.id_periferico = i.id_periferico
        WHERE i.id_pedido IN (${marcadores(ids)})
        ORDER BY i.id_item_pedido
    `;
    const itens = (await query(sql, ids)).rows;
    pedidos.forEach(p => {
        p.itens = itens
            .filter(i => i.id_pedido === p.id_pedido)
            .map(i => ({
                ...i,
                quantidade_disponivel_item: i.quantidade_item - i.quantidade_devolvida_item - i.quantidade_pendente_item
            }));
    });
    return pedidos;
}

// ---------------------------------------------------------------------
// CLIENTE: finalizar compra (cria pedido + itens e baixa o estoque, tudo em UMA transação)
// ---------------------------------------------------------------------
exports.criarPedido = async (req, res) => {
    const { itens, forma_pagamento_pedido, endereco_entrega_pedido } = req.body;

    if (!Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ sucesso: false, mensagem: 'O carrinho está vazio.' });
    }
    if (!FORMAS_PAGAMENTO.includes(forma_pagamento_pedido)) {
        return res.status(400).json({ sucesso: false, mensagem: 'Escolha uma forma de pagamento.' });
    }
    const endereco = (endereco_entrega_pedido || '').trim();
    if (endereco.length < 5) {
        return res.status(400).json({ sucesso: false, mensagem: 'Informe o endereço de entrega.' });
    }

    // PIX é um pagamento real: precisa da chave configurada no .env
    if (forma_pagamento_pedido === 'pix' && !pixConfigurado()) {
        return res.status(400).json({ sucesso: false, mensagem: 'O PIX ainda não está configurado nesta loja (defina PIX_CHAVE no .env). Escolha outra forma de pagamento.' });
    }

    // junta itens repetidos e valida as quantidades
    const quantidades = new Map();
    for (const item of itens) {
        const id = parseInt(item.id_periferico, 10);
        const qtd = parseInt(item.quantidade, 10);
        if (isNaN(id) || isNaN(qtd) || qtd < 1 || qtd > 99) {
            return res.status(400).json({ sucesso: false, mensagem: 'Item ou quantidade inválida no carrinho.' });
        }
        quantidades.set(id, (quantidades.get(id) || 0) + qtd);
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const ids = [...quantidades.keys()];
        // O preço e o estoque vêm do BANCO - nunca confiamos no preço enviado pelo navegador
        const produtos = (await client.query(
            `SELECT id_periferico, nome_periferico, preco_periferico, quantidade_estoque_periferico
             FROM public.periferico WHERE id_periferico IN (${marcadores(ids)}) FOR UPDATE`, ids
        )).rows;

        if (produtos.length !== ids.length) {
            throw new ErroNegocio('Um dos produtos do carrinho não existe mais.');
        }

        let total = 0;
        for (const p of produtos) {
            const qtd = quantidades.get(p.id_periferico);
            if (p.quantidade_estoque_periferico < qtd) {
                throw new ErroNegocio(`Estoque insuficiente para "${p.nome_periferico}" (disponível: ${p.quantidade_estoque_periferico}).`);
            }
            total += Number(p.preco_periferico) * qtd;
        }
        total = Math.round(total * 100) / 100;

        // PIX: o pedido fica "aguardando pagamento" até o dinheiro chegar.
        // Cartão e boleto continuam SIMULADOS: o pedido já nasce como "pago".
        const statusInicial = forma_pagamento_pedido === 'pix' ? 'aguardando_pagamento' : 'pago';
        const pedido = (await client.query(
            `INSERT INTO public.pedido (id_usuario, status_pedido, forma_pagamento_pedido, endereco_entrega_pedido, valor_total_pedido)
             VALUES ($1, $2, $3, $4, $5) RETURNING id_pedido`,
            [req.usuario.id_usuario, statusInicial, forma_pagamento_pedido, endereco, total]
        )).rows[0];

        for (const p of produtos) {
            const qtd = quantidades.get(p.id_periferico);
            await client.query(
                `INSERT INTO public.item_pedido (id_pedido, id_periferico, quantidade_item, preco_unitario_item)
                 VALUES ($1, $2, $3, $4)`,
                [pedido.id_pedido, p.id_periferico, qtd, p.preco_periferico]
            );
            await client.query(
                `UPDATE public.periferico
                 SET quantidade_estoque_periferico = quantidade_estoque_periferico - $1
                 WHERE id_periferico = $2`,
                [qtd, p.id_periferico]
            );
        }

        await client.query('COMMIT');

        // gera o QR Code depois de gravar o pedido; se falhar, o cliente pode pedir de novo em "Meus pedidos"
        let pix = null;
        if (statusInicial === 'aguardando_pagamento') {
            try {
                pix = await gerarPixPedido(pedido.id_pedido, total);
            } catch (erroPix) {
                console.error('Erro ao gerar PIX:', erroPix.message);
            }
        }

        res.status(201).json({
            sucesso: true,
            mensagem: 'Pedido realizado com sucesso!',
            id_pedido: pedido.id_pedido,
            valor_total_pedido: total,
            status_pedido: statusInicial,
            pix
        });
    } catch (error) {
        await client.query('ROLLBACK');
        if (error instanceof ErroNegocio) {
            return res.status(400).json({ sucesso: false, mensagem: error.message });
        }
        console.error('Erro ao criar pedido:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao finalizar o pedido.' });
    } finally {
        client.release();
    }
};

// CLIENTE: meus pedidos
exports.meusPedidos = async (req, res) => {
    try {
        const sql = `
            SELECT id_pedido, data_pedido, status_pedido, forma_pagamento_pedido,
                   endereco_entrega_pedido, valor_total_pedido
            FROM public.pedido WHERE id_usuario = $1 ORDER BY id_pedido DESC
        `;
        const pedidos = (await query(sql, [req.usuario.id_usuario])).rows;
        await anexarItens(pedidos);
        res.json({ sucesso: true, pedidos });
    } catch (error) {
        console.error('Erro ao listar meus pedidos:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar seus pedidos.' });
    }
};

// CLIENTE (dono) ou ADMIN: um pedido
exports.obterPedido = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            return res.status(400).json({ sucesso: false, mensagem: 'ID inválido.' });
        }
        const sql = `
            SELECT p.id_pedido, p.id_usuario, p.data_pedido, p.status_pedido, p.forma_pagamento_pedido,
                   p.endereco_entrega_pedido, p.valor_total_pedido, u.nome_usuario
            FROM public.pedido p JOIN public.usuario u ON u.id_usuario = p.id_usuario
            WHERE p.id_pedido = $1
        `;
        const pedido = (await query(sql, [id])).rows[0];
        if (!pedido || (!ehAdmin(req.usuario) && pedido.id_usuario !== req.usuario.id_usuario)) {
            return res.status(404).json({ sucesso: false, mensagem: 'Pedido não encontrado.' });
        }
        await anexarItens([pedido]);
        res.json({ sucesso: true, pedido });
    } catch (error) {
        console.error('Erro ao obter pedido:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro interno do servidor.' });
    }
};

// ADMIN: todos os pedidos (filtro opcional ?status=)
exports.listarPedidos = async (req, res) => {
    try {
        const status = req.query.status;
        let sql = `
            SELECT p.id_pedido, p.id_usuario, p.data_pedido, p.status_pedido, p.forma_pagamento_pedido,
                   p.endereco_entrega_pedido, p.valor_total_pedido, u.nome_usuario, u.email_usuario
            FROM public.pedido p JOIN public.usuario u ON u.id_usuario = p.id_usuario
        `;
        const valores = [];
        if (status) {
            sql += ' WHERE p.status_pedido = $1';
            valores.push(status);
        }
        sql += ' ORDER BY p.id_pedido DESC';
        const pedidos = (await query(sql, valores)).rows;
        await anexarItens(pedidos);
        res.json({ sucesso: true, pedidos });
    } catch (error) {
        console.error('Erro ao listar pedidos:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar pedidos.' });
    }
};

// ADMIN: mudar o status (pago -> enviado -> entregue, ou cancelar antes de entregar)
exports.atualizarStatus = async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const novo = req.body.status_pedido;
    if (isNaN(id)) {
        return res.status(400).json({ sucesso: false, mensagem: 'ID inválido.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const pedido = (await client.query(
            'SELECT id_pedido, status_pedido FROM public.pedido WHERE id_pedido = $1 FOR UPDATE', [id]
        )).rows[0];
        if (!pedido) throw new ErroNegocio('Pedido não encontrado.');

        const permitidos = TRANSICOES[pedido.status_pedido] || [];
        if (!permitidos.includes(novo)) {
            throw new ErroNegocio(`Não é possível mudar de "${pedido.status_pedido}" para "${novo}".`);
        }

        // Cancelar devolve os produtos ao estoque
        if (novo === 'cancelado') {
            const itens = (await client.query(
                'SELECT id_periferico, quantidade_item FROM public.item_pedido WHERE id_pedido = $1', [id]
            )).rows;
            for (const item of itens) {
                await client.query(
                    `UPDATE public.periferico
                     SET quantidade_estoque_periferico = quantidade_estoque_periferico + $1
                     WHERE id_periferico = $2`,
                    [item.quantidade_item, item.id_periferico]
                );
            }
        }

        await client.query('UPDATE public.pedido SET status_pedido = $1 WHERE id_pedido = $2', [novo, id]);
        await client.query('COMMIT');
        res.json({
            sucesso: true,
            mensagem: novo === 'pago' ? `Pagamento do pedido #${id} confirmado.` : `Pedido #${id} atualizado para "${novo}".`
        });
    } catch (error) {
        await client.query('ROLLBACK');
        if (error instanceof ErroNegocio) {
            return res.status(400).json({ sucesso: false, mensagem: error.message });
        }
        console.error('Erro ao atualizar status:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao atualizar o pedido.' });
    } finally {
        client.release();
    }
};

// CLIENTE (dono) ou ADMIN: reabre o PIX (QR Code + copia e cola) de um pedido que ainda não foi pago
exports.obterPix = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            return res.status(400).json({ sucesso: false, mensagem: 'ID inválido.' });
        }
        const pedido = (await query(
            `SELECT id_pedido, id_usuario, status_pedido, forma_pagamento_pedido, valor_total_pedido
             FROM public.pedido WHERE id_pedido = $1`, [id]
        )).rows[0];
        if (!pedido || (!ehAdmin(req.usuario) && pedido.id_usuario !== req.usuario.id_usuario)) {
            return res.status(404).json({ sucesso: false, mensagem: 'Pedido não encontrado.' });
        }
        if (pedido.forma_pagamento_pedido !== 'pix' || pedido.status_pedido !== 'aguardando_pagamento') {
            return res.status(400).json({ sucesso: false, mensagem: 'Este pedido não está aguardando pagamento por PIX.' });
        }
        if (!pixConfigurado()) {
            return res.status(400).json({ sucesso: false, mensagem: 'O PIX não está configurado nesta loja.' });
        }
        const pix = await gerarPixPedido(pedido.id_pedido, Number(pedido.valor_total_pedido));
        res.json({ sucesso: true, id_pedido: pedido.id_pedido, valor_total_pedido: Number(pedido.valor_total_pedido), ...pix });
    } catch (error) {
        console.error('Erro ao obter PIX:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao gerar o PIX.' });
    }
};
