const express = require('express');
const router = express.Router();
const devolucaoController = require('../controllers/devolucaoController');
const { exigirLogin, exigirAdmin } = require('../middlewares/auth');

// Cliente
router.post('/', exigirLogin, devolucaoController.solicitarDevolucao);
router.get('/minhas', exigirLogin, devolucaoController.minhasDevolucoes);

// Administrador
router.get('/listar', exigirAdmin, devolucaoController.listarDevolucoes);
router.put('/:id/decidir', exigirAdmin, devolucaoController.decidirDevolucao);

module.exports = router;
