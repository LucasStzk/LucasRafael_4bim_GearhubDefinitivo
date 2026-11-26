const express = require('express');
const router = express.Router();
const categoriaController = require('../controllers/categoriaController');
const { exigirAdmin } = require('../middlewares/auth');

// Rotas do CRUD de Categorias
// Consultar é público (o catálogo precisa); inserir/alterar/excluir é só do administrador.
// (/listar precisa vir antes de /:id)
router.get('/listar', categoriaController.listarCategorias);
router.get('/:id', categoriaController.obterCategoria);
router.post('/', exigirAdmin, categoriaController.criarCategoria);
router.put('/:id', exigirAdmin, categoriaController.atualizarCategoria);
router.delete('/:id', exigirAdmin, categoriaController.deletarCategoria);

module.exports = router;
