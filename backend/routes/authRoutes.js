const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Login / logout / cadastro (cookies)
router.post('/cadastro', authController.cadastrar);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/eu', authController.eu);

// Login com Google
router.get('/config', authController.config);
router.post('/google', authController.loginGoogle);

// Recuperação de senha por e-mail
router.post('/esqueci-senha', authController.esqueciSenha);
router.post('/redefinir-senha', authController.redefinirSenha);

module.exports = router;
