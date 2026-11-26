const express = require('express');
const router = express.Router();
const pedidoController = require('../controllers/pedidoController');
const { exigirLogin, exigirAdmin } = require('../middlewares/auth');

// Cliente
router.post('/', exigirLogin, pedidoController.criarPedido);
router.get('/meus', exigirLogin, pedidoController.meusPedidos);

// Administrador
router.get('/listar', exigirAdmin, pedidoController.listarPedidos);
router.put('/:id/status', exigirAdmin, pedidoController.atualizarStatus);

// Dono do pedido ou administrador
router.get('/:id/pix', exigirLogin, pedidoController.obterPix);
// (por último, por causa do :id)
router.get('/:id', exigirLogin, pedidoController.obterPedido);

module.exports = router;
