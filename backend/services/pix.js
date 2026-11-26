// =====================================================================
// PIX "copia e cola" + QR Code (BR Code estático do Banco Central)
//
// O código gerado é um PIX de verdade: qualquer app de banco consegue ler o QR Code
// (ou colar o código) e o dinheiro cai na chave definida em PIX_CHAVE no .env.
//
// IMPORTANTE: o PIX estático NÃO avisa o sistema quando é pago. Por isso o pedido fica
// "aguardando pagamento" e o funcionário confirma o recebimento no painel.
// (Confirmação automática exigiria um provedor de pagamento, como Mercado Pago, Efí, etc.)
// =====================================================================

// tira acentos e caracteres fora do ASCII (o BR Code só aceita ASCII)
function semAcento(texto) {
    return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '');
}

// formato TLV: ID (2 dígitos) + tamanho (2 dígitos) + valor
function campo(id, valor) {
    const v = String(valor);
    return id + String(v.length).padStart(2, '0') + v;
}

// CRC16/CCITT-FALSE (polinômio 0x1021, valor inicial 0xFFFF) - exigido pelo padrão no fim do código
function crc16(texto) {
    let crc = 0xFFFF;
    for (let i = 0; i < texto.length; i++) {
        crc ^= texto.charCodeAt(i) << 8;
        for (let b = 0; b < 8; b++) {
            crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
            crc &= 0xFFFF;
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

function pixConfigurado() {
    return !!(process.env.PIX_CHAVE && process.env.PIX_CHAVE.trim());
}

function gerarBrCode({ chave, nome, cidade, valor, txid }) {
    const conta = campo('00', 'br.gov.bcb.pix') + campo('01', chave);
    const idTransacao = semAcento(txid || '***').replace(/[^A-Za-z0-9*]/g, '').slice(0, 25) || '***';

    const semCrc =
        campo('00', '01') +                                              // versão do formato
        campo('26', conta) +                                             // dados da conta PIX (chave)
        campo('52', '0000') +                                            // categoria do comerciante
        campo('53', '986') +                                             // moeda: BRL
        (valor > 0 ? campo('54', Number(valor).toFixed(2)) : '') +      // valor
        campo('58', 'BR') +                                              // país
        campo('59', semAcento(nome).toUpperCase().slice(0, 25) || 'GEARHUB') +      // nome do recebedor
        campo('60', semAcento(cidade).toUpperCase().slice(0, 15) || 'BRASIL') +     // cidade do recebedor
        campo('62', campo('05', idTransacao)) +                          // identificador da transação
        '6304';                                                          // começo do CRC

    return semCrc + crc16(semCrc);
}

// Gera o código e a imagem do QR Code (data URL PNG) de um pedido
async function gerarPixPedido(idPedido, valor) {
    if (!pixConfigurado()) throw new Error('PIX_NAO_CONFIGURADO');

    const copia = gerarBrCode({
        chave: process.env.PIX_CHAVE.trim(),
        nome: process.env.PIX_NOME || 'GEARHUB',
        cidade: process.env.PIX_CIDADE || 'BRASIL',
        valor,
        txid: 'GEARHUB' + idPedido
    });

    const QRCode = require('qrcode');
    const qr = await QRCode.toDataURL(copia, { width: 320, margin: 1, errorCorrectionLevel: 'M' });
    return { copia_e_cola: copia, qr_code: qr };
}

module.exports = { crc16, campo, gerarBrCode, gerarPixPedido, pixConfigurado };
