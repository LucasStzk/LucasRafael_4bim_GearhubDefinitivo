const express = require('express');
const router = express.Router();
const fabricanteController = require('../controllers/fabricanteController');
const { exigirAdmin } = require('../middlewares/auth');

// Rotas do CRUD de Fabricantes
// Consultar é público (o catálogo precisa); inserir/alterar/excluir é só do administrador.
// (/listar precisa vir antes de /:id)
router.get('/listar', fabricanteController.listarFabricantes);
router.get('/:id', fabricanteController.obterFabricante);
router.post('/', exigirAdmin, fabricanteController.criarFabricante);
router.put('/:id', exigirAdmin, fabricanteController.atualizarFabricante);
router.delete('/:id', exigirAdmin, fabricanteController.deletarFabricante);

module.exports = router;
