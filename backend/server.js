const express = require('express');
const cors = require('cors');
const path = require('path');

// Importa a função de consulta do banco (database.js já carrega o .env)
const { query } = require('./database');

// Middleware que identifica o usuário logado pelo cookie
const { identificar } = require('./middlewares/auth');

// Importa as rotas (Router = mapeamento dos endpoints)
const authRoutes = require('./routes/authRoutes');
const categoriaRoutes = require('./routes/categoriaRoutes');
const fabricanteRoutes = require('./routes/fabricanteRoutes');
const perifericoRoutes = require('./routes/perifericoRoutes');
const especificacaoRoutes = require('./routes/especificacaoRoutes');
const pedidoRoutes = require('./routes/pedidoRoutes');
const devolucaoRoutes = require('./routes/devolucaoRoutes');
const usuarioRoutes = require('./routes/usuarioRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

app.use(cors());
app.use(express.json());

// Servir imagens e o front-end (assim http://localhost:3001 já abre a loja)
app.use('/imagens', express.static(path.join(__dirname, '../imagens')));
app.use('/frontend', express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => res.redirect('/frontend/inicio/inicio.html'));

// A partir daqui, toda requisição passa por "identificar" (lê o cookie de login)
app.use(identificar);

// Definir Rotas
app.use('/auth', authRoutes);
app.use('/categoria', categoriaRoutes);
app.use('/fabricante', fabricanteRoutes);
app.use('/periferico', perifericoRoutes);
app.use('/especificacao', especificacaoRoutes);
app.use('/pedido', pedidoRoutes);
app.use('/devolucao', devolucaoRoutes);
app.use('/usuario', usuarioRoutes);
app.use('/admin', adminRoutes);

const PORT = process.env.PORT || 3001;

// Inicializa o servidor e testa o PostgreSQL
app.listen(PORT, async () => {
    console.log(`\n=================================`);
    console.log(`🚀 Gearhub executando na porta ${PORT}`);
    console.log(`🌐 Abra: http://localhost:${PORT}`);

    try {
        await query('SELECT 1');
        console.log(`✅ Banco de Dados ${process.env.DB_NAME} conectado com sucesso!`);
    } catch (error) {
        console.error(`❌ FALHA NA CONEXÃO COM O BANCO DE DADOS:`);
        console.error(`   Motivo: ${error.message}`);
        console.error(`👉 Ajuste o arquivo backend/.env com a senha correta do seu PostgreSQL.`);
    }
    console.log(`=================================\n`);
});
