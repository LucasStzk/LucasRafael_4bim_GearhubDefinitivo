const express = require('express');
const multer = require('multer');
const router = express.Router();
const perifericoController = require('../controllers/perifericoController');
const { exigirAdmin } = require('../middlewares/auth');

// Multer guarda o arquivo em memória para o Sharp processar
const upload = multer({ storage: multer.memoryStorage() });

// Consultas públicas (catálogo da loja)
router.get('/listar', perifericoController.listarPerifericos);
router.get('/destaques', perifericoController.listarDestaques);   // antes de /:id
router.get('/:id', perifericoController.obterPeriferico);

// Alterações: só administrador
router.post('/', exigirAdmin, perifericoController.criarPeriferico);
router.put('/:id', exigirAdmin, perifericoController.atualizarPeriferico);
router.delete('/:id', exigirAdmin, perifericoController.deletarPeriferico);

// Upload da imagem do periférico (salva em imagens/<id>.png)
router.post('/upload/:id', exigirAdmin, upload.single('imagem'), perifericoController.uploadImagem);

module.exports = router;
