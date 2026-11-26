const { query } = require('../database');

// ADMIN: lista de usuários (nunca devolve o hash da senha)
exports.listarUsuarios = async (req, res) => {
    try {
        const result = await query(
            `SELECT id_usuario, nome_usuario, email_usuario, perfil_usuario, data_cadastro_usuario
             FROM public.usuario ORDER BY id_usuario`
        );
        res.json({ sucesso: true, usuarios: result.rows });
    } catch (error) {
        console.error('Erro ao listar usuários:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar usuários.' });
    }
};

// ADMIN: mudar o perfil (cliente, admin = funcionário, ou ambos)
exports.alterarPerfil = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { perfil_usuario } = req.body;

        if (isNaN(id)) {
            return res.status(400).json({ sucesso: false, mensagem: 'ID inválido.' });
        }
        if (!['cliente', 'admin', 'ambos'].includes(perfil_usuario)) {
            return res.status(400).json({ sucesso: false, mensagem: 'Perfil inválido.' });
        }
        if (id === req.usuario.id_usuario) {
            return res.status(400).json({ sucesso: false, mensagem: 'Você não pode alterar o seu próprio perfil.' });
        }

        const result = await query(
            'UPDATE public.usuario SET perfil_usuario = $1 WHERE id_usuario = $2 RETURNING id_usuario, perfil_usuario',
            [perfil_usuario, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ sucesso: false, mensagem: 'Usuário não encontrado.' });
        }
        res.json({ sucesso: true, mensagem: 'Perfil alterado com sucesso!', usuario: result.rows[0] });
    } catch (error) {
        console.error('Erro ao alterar perfil:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao alterar perfil.' });
    }
};
