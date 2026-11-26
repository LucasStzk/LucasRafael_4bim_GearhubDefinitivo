# Especificação das APIs - Gearhub

Contrato entre o front-end e o back-end. Todas as respostas são JSON no formato `{ "sucesso": true|false, "mensagem": "...", ... }`.
O login usa **cookie** (`gearhub_sessao`, HttpOnly): o navegador o envia sozinho, então as chamadas abaixo não levam token no cabeçalho.

**Códigos de status usados:** `200` ok · `201` criado · `400` dado inválido ou regra de negócio · `401` não logado · `403` sem permissão (não é funcionário) · `404` não encontrado · `500` erro interno.

**Perfis:** `cliente` (só loja) · `admin` (funcionário) · `ambos` (cliente e funcionário). Onde a tabela diz **admin**, vale para `admin` e `ambos`.

---

## 1. Autenticação

| Método e rota | Acesso | Corpo (JSON) | Resposta de sucesso |
|---|---|---|---|
| `POST /auth/cadastro` | público | `nome_usuario`, `email_usuario`, `senha_usuario` (mín. 6), `confirmar_senha` | `201` + cookie. `{ sucesso, mensagem, usuario: { id_usuario, nome_usuario, email_usuario, perfil_usuario: "cliente" } }` |
| `POST /auth/login` | público | `email_usuario`, `senha_usuario` | `200` + cookie. `{ sucesso, mensagem, usuario: { id_usuario, nome_usuario, email_usuario, perfil_usuario } }` |
| `POST /auth/logout` | público | - | `200` + cookie apagado. `{ sucesso, mensagem }` |
| `GET /auth/eu` | público | - | `{ sucesso: true, logado: false }` ou `{ sucesso: true, logado: true, usuario: {...} }` |

Erros: `400` (campo inválido, e-mail repetido, senhas diferentes) · `401` (`"E-mail ou senha inválidos."`).

### Login com Google

| Método e rota | Acesso | Corpo (JSON) | Resposta |
|---|---|---|---|
| `GET /auth/config` | público | - | `{ sucesso, google_client_id }` (`null` se não estiver configurado; o Client ID não é segredo) |
| `POST /auth/google` | público | `credential` (token JWT entregue pelo botão do Google) | `200` + cookie. `{ sucesso, mensagem, usuario }`. `400` sem configuração/credencial · `401` token inválido, e-mail não verificado ou e-mail vinculado a outra conta Google |

Regras: o token é verificado no servidor; conta nova é sempre `cliente`; e-mail já existente é vinculado à conta (`google_id_usuario`).

### Recuperação de senha

| Método e rota | Acesso | Corpo (JSON) | Resposta |
|---|---|---|---|
| `POST /auth/esqueci-senha` | público | `email_usuario` | `200 { sucesso, mensagem }` - **a mesma resposta** exista ou não o e-mail (envia o link só se existir). `400` se o e-mail for inválido |
| `POST /auth/redefinir-senha` | público | `token` (64 caracteres hexadecimais, vindo do link), `senha_usuario` (mín. 6), `confirmar_senha` | `200 { sucesso, mensagem }`. `400` se o link for inválido/expirado (vale 1 hora, uso único) ou as senhas não conferirem |

## 2. Catálogo (periféricos, categorias, fabricantes, especificações)

| Método e rota | Acesso | Corpo / parâmetros | Resposta |
|---|---|---|---|
| `GET /periferico/listar` | público | - | `{ sucesso, perifericos: [{ id_periferico, nome_periferico, preco_periferico, quantidade_estoque_periferico, id_categoria, id_fabricante, nome_categoria, nome_fabricante }] }` |
| `GET /periferico/destaques` | público | - | os 3 mais vendidos (mesmos campos + `vendidos`) |
| `GET /periferico/:id` | público | `:id` inteiro | `{ sucesso, periferico }` · `404` se não existir |
| `POST /periferico` | admin | `id_periferico`, `nome_periferico`, `preco_periferico`, `quantidade_estoque_periferico`, `id_categoria`, `id_fabricante` | `201 { sucesso, mensagem, periferico }` |
| `PUT /periferico/:id` | admin | mesmos campos (sem o id) | `{ sucesso, mensagem, periferico }` |
| `DELETE /periferico/:id` | admin | - | `{ sucesso, mensagem }` · `400` se já foi vendido |
| `POST /periferico/upload/:id` | admin | `multipart/form-data`, campo `imagem` | `{ sucesso, mensagem }` (salva `imagens/<id>.png`) |

`/categoria`, `/fabricante` e `/especificacao` seguem o mesmo molde (`GET /listar`, `GET /:id`, e `POST`, `PUT /:id`, `DELETE /:id` só para admin):

| Recurso | Campos do corpo |
|---|---|
| categoria | `id_categoria`, `nome_categoria`, `descricao_categoria` |
| fabricante | `id_fabricante`, `nome_fabricante`, `pais_fabricante` |
| especificacao (1:1, o `:id` é o do periférico) | `id_periferico`, `conexao_especificacao`, `garantia_meses_especificacao`, `peso_gramas_especificacao`, `iluminacao_rgb_especificacao` (boolean), `detalhes_especificacao` |

## 3. Pedidos

| Método e rota | Acesso | Corpo / parâmetros | Resposta |
|---|---|---|---|
| `POST /pedido` | logado | `itens: [{ id_periferico, quantidade }]`, `forma_pagamento_pedido` (`pix`, `cartao_credito`, `cartao_debito`, `boleto`), `endereco_entrega_pedido` | `201 { sucesso, mensagem, id_pedido, valor_total_pedido, status_pedido, pix }` - em `pix` vem `{ copia_e_cola, qr_code }` (só no PIX; `qr_code` é uma imagem PNG em data URL). `400` se o PIX não estiver configurado |
| `GET /pedido/meus` | logado | - | `{ sucesso, pedidos: [ pedido ] }` |
| `GET /pedido/:id` | dono ou admin | - | `{ sucesso, pedido }` · `404` se não for dele |
| `GET /pedido/:id/pix` | dono ou admin | - | `{ sucesso, id_pedido, valor_total_pedido, copia_e_cola, qr_code }` - só para pedido PIX `aguardando_pagamento` (senão `400`) |
| `GET /pedido/listar?status=` | admin | `status` opcional | `{ sucesso, pedidos: [ pedido + nome_usuario, email_usuario ] }` |
| `PUT /pedido/:id/status` | admin | `status_pedido` | `{ sucesso, mensagem }` |

Formato de um `pedido`:

```json
{
  "id_pedido": 3, "data_pedido": "2026-09-25T11:05:00.000Z", "status_pedido": "devolvido_parcial",
  "forma_pagamento_pedido": "cartao_credito", "endereco_entrega_pedido": "Rua Paraná, 88",
  "valor_total_pedido": "519.70",
  "itens": [
    { "id_item_pedido": 5, "id_periferico": 1, "nome_periferico": "Teclado Mecânico Kumara K552",
      "quantidade_item": 2, "preco_unitario_item": "189.90",
      "quantidade_devolvida_item": 1, "quantidade_pendente_item": 0, "quantidade_disponivel_item": 1 }
  ]
}
```

Regras: o preço e o estoque vêm do banco (o corpo só leva ID e quantidade); a compra é uma transação (`400` com `"Estoque insuficiente..."` desfaz tudo). Transições de status permitidas: `aguardando_pagamento → pago | cancelado` (o funcionário confirma o recebimento do PIX), `pago → enviado | cancelado` e `enviado → entregue | cancelado` (cancelar devolve o estoque). Pedidos `aguardando_pagamento` não contam nas vendas do painel. `devolvido_parcial` e `devolvido` são definidos automaticamente pelas devoluções.

## 4. Devoluções

| Método e rota | Acesso | Corpo / parâmetros | Resposta |
|---|---|---|---|
| `POST /devolucao` | logado (dono do pedido) | `id_pedido`, `motivo_devolucao`, `itens: [{ id_item_pedido, quantidade }]` | `201 { sucesso, mensagem }` |
| `GET /devolucao/minhas` | logado | - | `{ sucesso, devolucoes: [...] }` |
| `GET /devolucao/listar?status=` | admin | `status`: `solicitada`, `aprovada` ou `recusada` | `{ sucesso, devolucoes: [...] }` |
| `PUT /devolucao/:id/decidir` | admin | `decisao` (`aprovada` ou `recusada`), `resposta_devolucao` (opcional) | `{ sucesso, mensagem, valor_reembolso }` |

Regras: só pedidos `entregue` ou `devolvido_parcial`; a quantidade pedida não pode passar de `quantidade_item - quantidade_devolvida_item - pendentes`. Aprovar soma ao `quantidade_devolvida_item`, devolve ao estoque, calcula o reembolso (`quantidade × preço unitário`) e recalcula o status do pedido.

## 5. Usuários e painel (admin)

| Método e rota | Corpo | Resposta |
|---|---|---|
| `GET /usuario/listar` | - | `{ sucesso, usuarios: [{ id_usuario, nome_usuario, email_usuario, perfil_usuario, data_cadastro_usuario }] }` (nunca devolve a senha) |
| `PUT /usuario/:id/perfil` | `perfil_usuario`: `cliente`, `admin` ou `ambos` | `{ sucesso, mensagem, usuario }` · `400` ao tentar mudar o próprio perfil |
| `GET /admin/resumo` | - | `{ sucesso, resumo: { clientes, perifericos, estoque_baixo, devolucoes_pendentes, vendas_liquidas, pedidos_por_status: [{ status_pedido, total }] } }` |
