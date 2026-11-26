const { query } = require('../database');

// ADMIN: números do painel inicial
exports.resumo = async (req, res) => {
    try {
        const um = async (sql) => Object.values((await query(sql)).rows[0])[0];

        const clientes = await um(`SELECT CAST(COUNT(*) AS integer) FROM public.usuario WHERE perfil_usuario IN ('cliente', 'ambos')`);
        const perifericos = await um('SELECT CAST(COUNT(*) AS integer) FROM public.periferico');
        const estoqueBaixo = await um('SELECT CAST(COUNT(*) AS integer) FROM public.periferico WHERE quantidade_estoque_periferico < 10');
        const devolucoesPendentes = await um(`SELECT CAST(COUNT(*) AS integer) FROM public.devolucao WHERE status_devolucao = 'solicitada'`);
        const bruto = Number(await um(`SELECT COALESCE(SUM(valor_total_pedido), 0) FROM public.pedido WHERE status_pedido NOT IN ('cancelado', 'aguardando_pagamento')`));
        const reembolsado = Number(await um(`SELECT COALESCE(SUM(valor_reembolso_devolucao), 0) FROM public.devolucao WHERE status_devolucao = 'aprovada'`));

        const porStatus = (await query(
            'SELECT status_pedido, CAST(COUNT(*) AS integer) AS total FROM public.pedido GROUP BY status_pedido'
        )).rows;

        res.json({
            sucesso: true,
            resumo: {
                clientes, perifericos, estoque_baixo: estoqueBaixo,
                devolucoes_pendentes: devolucoesPendentes,
                vendas_liquidas: Math.round((bruto - reembolsado) * 100) / 100,
                pedidos_por_status: porStatus
            }
        });
    } catch (error) {
        console.error('Erro ao montar resumo:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao carregar o resumo.' });
    }
};
