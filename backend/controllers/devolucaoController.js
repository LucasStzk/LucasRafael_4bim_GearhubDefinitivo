const { query, pool } = require('../database');

class ErroNegocio extends Error {}

const SQL_LISTA = `
    SELECT d.id_devolucao, d.id_item_pedido, d.quantidade_devolucao, d.motivo_devolucao,
           d.status_devolucao, d.data_solicitacao_devolucao, d.data_decisao_devolucao,
           d.valor_reembolso_devolucao, d.resposta_devolucao,
           i.id_pedido, i.preco_unitario_item, per.nome_periferico, u.nome_usuario, u.email_usuario
    FROM public.devolucao d
    JOIN public.item_pedido i ON i.id_item_pedido = d.id_item_pedido
    JOIN public.pedido p ON p.id_pedido = i.id_pedido
    JOIN public.usuario u ON u.id_usuario = p.id_usuario
    JOIN public.periferico per ON per.id_periferico = i.id_periferico
`;

// ---------------------------------------------------------------------
// CLIENTE: pedir devolução de UM, VÁRIOS ou TODOS os itens de um pedido.
// Pode devolver só parte da quantidade de cada item (ex.: 1 de 3 mouses).
// ---------------------------------------------------------------------
exports.solicitarDevolucao = async (req, res) => {
    const id_pedido = parseInt(req.body.id_pedido, 10);
    const motivo = (req.body.motivo_devolucao || '').trim();
    const itens = req.body.itens;

    if (isNaN(id_pedido)) {
        return res.status(400).json({ sucesso: false, mensagem: 'Pedido inválido.' });
    }
    if (motivo.length < 3) {
        return res.status(400).json({ sucesso: false, mensagem: 'Informe o motivo da devolução.' });
    }
    if (!Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ sucesso: false, mensagem: 'Selecione pelo menos um item para devolver.' });
    }

    const quantidades = new Map();
    for (const item of itens) {
        const id = parseInt(item.id_item_pedido, 10);
        const qtd = parseInt(item.quantidade, 10);
        if (isNaN(id) || isNaN(qtd) || qtd < 1) {
            return res.status(400).json({ sucesso: false, mensagem: 'Item ou quantidade inválida.' });
        }
        quantidades.set(id, (quantidades.get(id) || 0) + qtd);
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // o pedido precisa ser do próprio cliente
        const pedido = (await client.query(
            'SELECT id_pedido, status_pedido FROM public.pedido WHERE id_pedido = $1 AND id_usuario = $2 FOR UPDATE',
            [id_pedido, req.usuario.id_usuario]
        )).rows[0];
        if (!pedido) throw new ErroNegocio('Pedido não encontrado.');
        if (!['entregue', 'devolvido_parcial'].includes(pedido.status_pedido)) {
            throw new ErroNegocio('Só é possível devolver itens de pedidos já entregues.');
        }

        for (const [idItem, qtd] of quantidades) {
            const item = (await client.query(
                `SELECT i.id_item_pedido, i.quantidade_item, i.quantidade_devolvida_item, per.nome_periferico,
                        CAST(COALESCE((SELECT SUM(d.quantidade_devolucao) FROM public.devolucao d
                                       WHERE d.id_item_pedido = i.id_item_pedido
                                         AND d.status_devolucao = 'solicitada'), 0) AS integer) AS pendente
                 FROM public.item_pedido i JOIN public.periferico per ON per.id_periferico = i.id_periferico
                 WHERE i.id_item_pedido = $1 AND i.id_pedido = $2`,
                [idItem, id_pedido]
            )).rows[0];
            if (!item) throw new ErroNegocio('Um dos itens não pertence a este pedido.');

            const disponivel = item.quantidade_item - item.quantidade_devolvida_item - item.pendente;
            if (qtd > disponivel) {
                throw new ErroNegocio(
                    disponivel === 0
                        ? `"${item.nome_periferico}" já foi devolvido ou tem devolução em análise.`
                        : `Só restam ${disponivel} unidade(s) de "${item.nome_periferico}" para devolver.`
                );
            }

            await client.query(
                `INSERT INTO public.devolucao (id_item_pedido, quantidade_devolucao, motivo_devolucao, status_devolucao)
                 VALUES ($1, $2, $3, 'solicitada')`,
                [idItem, qtd, motivo]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ sucesso: true, mensagem: 'Devolução solicitada! Aguarde a análise da loja.' });
    } catch (error) {
        await client.query('ROLLBACK');
        if (error instanceof ErroNegocio) {
            return res.status(400).json({ sucesso: false, mensagem: error.message });
        }
        console.error('Erro ao solicitar devolução:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao solicitar devolução.' });
    } finally {
        client.release();
    }
};

// CLIENTE: minhas devoluções
exports.minhasDevolucoes = async (req, res) => {
    try {
        const result = await query(SQL_LISTA + ' WHERE p.id_usuario = $1 ORDER BY d.id_devolucao DESC', [req.usuario.id_usuario]);
        res.json({ sucesso: true, devolucoes: result.rows });
    } catch (error) {
        console.error('Erro ao listar minhas devoluções:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar devoluções.' });
    }
};

// ADMIN: todas as devoluções (filtro opcional ?status=)
exports.listarDevolucoes = async (req, res) => {
    try {
        const valores = [];
        let sql = SQL_LISTA;
        if (req.query.status) {
            sql += ' WHERE d.status_devolucao = $1';
            valores.push(req.query.status);
        }
        sql += ' ORDER BY d.id_devolucao DESC';
        const result = await query(sql, valores);
        res.json({ sucesso: true, devolucoes: result.rows });
    } catch (error) {
        console.error('Erro ao listar devoluções:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar devoluções.' });
    }
};

// ADMIN: aprovar ou recusar. Aprovando: o produto volta ao estoque,
// o item registra a quantidade devolvida e o status do pedido é recalculado.
exports.decidirDevolucao = async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { decisao } = req.body;
    const resposta = (req.body.resposta_devolucao || '').trim() || null;

    if (isNaN(id)) {
        return res.status(400).json({ sucesso: false, mensagem: 'ID inválido.' });
    }
    if (!['aprovada', 'recusada'].includes(decisao)) {
        return res.status(400).json({ sucesso: false, mensagem: 'Decisão inválida.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const dev = (await client.query(
            `SELECT d.id_devolucao, d.id_item_pedido, d.quantidade_devolucao, d.status_devolucao,
                    i.id_pedido, i.id_periferico, i.preco_unitario_item
             FROM public.devolucao d JOIN public.item_pedido i ON i.id_item_pedido = d.id_item_pedido
             WHERE d.id_devolucao = $1 FOR UPDATE`, [id]
        )).rows[0];
        if (!dev) throw new ErroNegocio('Devolução não encontrada.');
        if (dev.status_devolucao !== 'solicitada') throw new ErroNegocio('Esta devolução já foi analisada.');

        let reembolso = 0;
        if (decisao === 'aprovada') {
            reembolso = Math.round(dev.quantidade_devolucao * Number(dev.preco_unitario_item) * 100) / 100;

            await client.query(
                `UPDATE public.item_pedido
                 SET quantidade_devolvida_item = quantidade_devolvida_item + $1
                 WHERE id_item_pedido = $2`, [dev.quantidade_devolucao, dev.id_item_pedido]
            );
            await client.query(
                `UPDATE public.periferico
                 SET quantidade_estoque_periferico = quantidade_estoque_periferico + $1
                 WHERE id_periferico = $2`, [dev.quantidade_devolucao, dev.id_periferico]
            );

            // recalcula o status do pedido: devolveu tudo? ou só parte?
            const soma = (await client.query(
                `SELECT CAST(SUM(quantidade_item) AS integer) AS total,
                        CAST(SUM(quantidade_devolvida_item) AS integer) AS devolvido
                 FROM public.item_pedido WHERE id_pedido = $1`, [dev.id_pedido]
            )).rows[0];
            const novoStatus = soma.devolvido >= soma.total ? 'devolvido' : 'devolvido_parcial';
            await client.query('UPDATE public.pedido SET status_pedido = $1 WHERE id_pedido = $2', [novoStatus, dev.id_pedido]);
        }

        await client.query(
            `UPDATE public.devolucao
             SET status_devolucao = $1, valor_reembolso_devolucao = $2,
                 resposta_devolucao = $3, data_decisao_devolucao = CURRENT_TIMESTAMP
             WHERE id_devolucao = $4`,
            [decisao, reembolso, resposta, id]
        );

        await client.query('COMMIT');
        res.json({ sucesso: true, mensagem: `Devolução #${id} ${decisao}.`, valor_reembolso: reembolso });
    } catch (error) {
        await client.query('ROLLBACK');
        if (error instanceof ErroNegocio) {
            return res.status(400).json({ sucesso: false, mensagem: error.message });
        }
        console.error('Erro ao decidir devolução:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao analisar a devolução.' });
    } finally {
        client.release();
    }
};
