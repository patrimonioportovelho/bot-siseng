// Motor genérico de Pix "copia e cola" estático (EMV/BR Code do Bacen) —
// extraído de lib/eventos/pix.ts (Fase 6, 12/08/2026: "como gerar um link
// pix pra copiar e colar ou um qrcode pra pessoa pagar") pra Fase 8,
// 14/08/2026, onde o financeiro do corretor no Portal passou a usar o MESMO
// mecanismo pra dívidas dele (ex.: Fee Corretor Remax). lib/eventos/pix.ts
// agora só reexporta daqui, então nenhum ponto de chamada de evento mudou.
//
// Continua sem nenhuma API/gateway — qualquer app de banco lê o
// texto/QR. Por isso é "só informativo": ninguém aqui fica sabendo
// automaticamente quando foi pago (isso exigiria integração bancária de
// verdade — ver conversa sobre API Pix do BS2). O admin confere o Pix
// recebido por fora e marca manualmente.
export type PixDestino = {
  chave: string;
  nomeBeneficiario: string;
  cidade: string;
};

// Conta padrão usada por todo Pix estático "informativo" do sistema —
// convidado de evento (lib/eventos/pix.ts) e, desde a Fase 8, dívida do
// corretor no Financeiro do Portal (usuário confirmou explicitamente: "conta
// do evento (BS2)" quando perguntado). BS2, Ag 0001, Cc 998577-8, chave
// CNPJ da matriz. Contratos de honorários usam OUTRA conta (Sicredi, ver
// lib/documentos/gerar.ts#IMOBILIARIA_DADOS_BANCARIOS) — separada de
// propósito, pra não misturar caixa de evento/financeiro com o de
// honorários de transação.
export const PIX_CONTA_PADRAO: PixDestino = {
  // CNPJ da matriz como chave Pix — só dígitos, sem pontuação (é assim que
  // o padrão espera chave Pix tipo CNPJ).
  chave: "30902268000180",
  // Nome do beneficiário e cidade têm limite de tamanho no padrão BR Code
  // (25 e 15 caracteres) e não podem ter acento/caractere especial — por
  // isso nome fantasia (não a razão social inteira, não caberia) e cidade
  // sem estado, maiúsculo, sem acento.
  nomeBeneficiario: "REMAX ENGIMOB",
  cidade: "PORTO VELHO"
};

// Remove acento (á, ã, ô, ç etc.) — os campos de texto do BR Code só aceitam
// ASCII simples. Monta o regex por código de caractere (faixa Unicode dos
// "combining diacritical marks", U+0300 a U+036F) em vez de escrever um
// literal com acento no código-fonte, pra não depender de como o editor/
// ferramenta lida com caractere combinante ao salvar o arquivo.
const REGEX_DIACRITICOS = new RegExp(String.fromCharCode(91, 92, 117, 48, 51, 48, 48, 45, 92, 117, 48, 51, 54, 102, 93), "g");

function semAcento(s: string): string {
  return s.normalize("NFD").replace(REGEX_DIACRITICOS, "");
}

// Um campo EMV é ID (2 dígitos) + tamanho do valor (2 dígitos) + valor.
function campo(id: string, valor: string): string {
  return `${id}${valor.length.toString().padStart(2, "0")}${valor}`;
}

// CRC16/CCITT-FALSE (poly 0x1021, init 0xFFFF) — exigido pelo padrão EMV do
// BR Code, calculado sobre o payload inteiro incluindo o "6304" final (ID +
// tamanho do próprio campo do CRC), sem o valor do CRC ainda. Testado
// contra o vetor de teste canônico do CRC-16/CCITT-FALSE
// (crc16("123456789") === "29B1").
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// valor: em reais (ex.: 50 = R$ 50,00) — omite o campo quando não vier
// (o padrão permite Pix sem valor fixo, pagador digita). descricao: texto
// livre curto que aparece pro pagador antes de confirmar — cortado em 40
// caracteres, sem acento, por segurança de espaço. destino: pra quem vai o
// Pix — default PIX_CONTA_PADRAO (BS2), mas outro módulo pode passar outra
// conta se um dia precisar.
//
// Nota (Fase 6c, 14/08/2026): usuário reportou "deram inválidos" mesmo
// depois do fix do GUI maiúsculo, e pediu descrição mais simples ("Convite",
// sem espaço). A validação estrutural TLV/CRC do payload foi reconferida
// byte a byte (decodificador próprio + CRC recalculado em Python,
// independente do JS) e bateu certinho — o campo 26/02 (Informação
// Adicional) em si não quebra o padrão EMV. Mas nem todo app de banco
// implementa esse subcampo opcional direito, e o mais provável é a chave
// Pix (CNPJ) ainda não estar cadastrada de fato no Pix do banco — isso o
// código não tem como verificar. De qualquer forma, os pontos de chamada
// usam descrições curtas de uma palavra pra reduzir a superfície de erro.
export function gerarPixCopiaECola(params: { valor?: number | null; descricao?: string; destino?: PixDestino }): string {
  const { chave, nomeBeneficiario, cidade } = params.destino ?? PIX_CONTA_PADRAO;

  const infoAdicional = params.descricao ? campo("02", semAcento(params.descricao).slice(0, 40)) : "";
  // GUI em MAIÚSCULAS ("BR.GOV.BCB.PIX") — bug real (12/08/2026, usuário
  // reportou "nem qrcode nem texto deram certo, deram inválidos"): a
  // primeira versão usava minúsculas ("br.gov.bcb.pix"), que alguns apps
  // de banco recusam na validação estrutural do payload, antes de sequer
  // tentar achar a chave. Conferido contra exemplo oficial (payload
  // completo do Bacen/artigos técnicos) — o valor correto é sempre
  // maiúsculo nos dois exemplos (estático e dinâmico).
  const merchantAccount = campo("00", "BR.GOV.BCB.PIX") + campo("01", chave) + infoAdicional;

  const partes = [
    campo("00", "01"), // Payload Format Indicator
    campo("01", "11"), // Point of Initiation Method: estático/reutilizável
    campo("26", merchantAccount), // Merchant Account Information — Pix
    campo("52", "0000"), // Merchant Category Code — genérico
    campo("53", "986"), // Moeda: Real (ISO 4217)
    params.valor && params.valor > 0 ? campo("54", params.valor.toFixed(2)) : "",
    campo("58", "BR"),
    campo("59", nomeBeneficiario),
    campo("60", cidade),
    campo("62", campo("05", "***")) // Txid genérico — não amarra a uma cobrança via API
  ].join("");

  const semCrc = `${partes}6304`;
  return semCrc + crc16(semCrc);
}
