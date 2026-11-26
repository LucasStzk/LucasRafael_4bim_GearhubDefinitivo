const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { exigirAdmin } = require('../middlewares/auth');

// Painel do administrador
router.get('/resumo', exigirAdmin, adminController.resumo);

module.exports = router;
