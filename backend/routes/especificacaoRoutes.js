const express = require('express');
const router = express.Router();
const especificacaoController = require('../controllers/especificacaoController');
const { exigirAdmin } = require('../middlewares/auth');

// Rotas do CRUD de Especificacoes
// Consultar é público (o catálogo precisa); inserir/alterar/excluir é só do administrador.
// (/listar precisa vir antes de /:id)
router.get('/listar', especificacaoController.listarEspecificacoes);
router.get('/:id', especificacaoController.obterEspecificacao);
router.post('/', exigirAdmin, especificacaoController.criarEspecificacao);
router.put('/:id', exigirAdmin, especificacaoController.atualizarEspecificacao);
router.delete('/:id', exigirAdmin, especificacaoController.deletarEspecificacao);

module.exports = router;
