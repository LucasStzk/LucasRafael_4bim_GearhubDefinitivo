const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/usuarioController');
const { exigirAdmin } = require('../middlewares/auth');

// Só administrador
router.get('/listar', exigirAdmin, usuarioController.listarUsuarios);
router.put('/:id/perfil', exigirAdmin, usuarioController.alterarPerfil);

module.exports = router;
