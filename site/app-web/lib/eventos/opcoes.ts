// Listas de opções usadas no cadastro de Eventos — mesmo padrão do resto do
// sistema: texto livre validado aqui em TS, sem enum no schema (ver
// prisma/schema.prisma#eventos).

// Tipo do evento — texto livre pra digitar qualquer coisa, mas com sugestões
// prontas (datalist) pros casos mais comuns pedidos pelo usuário.
export const TIPOS_EVENTO = [
  "Reunião",
  "Treinamento",
  "Palestra",
  "Confraternização",
  "Festa",
  "Convenção",
  "Workshop",
  "Outro"
];

// "Nenhuma" = evento único, só em data_inicio. As demais repetem a partir de
// data_inicio até recorrencia_ate (ver lib/eventos/ocorrencias.ts pro
// cálculo das datas — não fica materializado em linha nenhuma).
export const RECORRENCIA_OPCOES = ["Nenhuma", "Diária", "Semanal", "Mensal"] as const;
export type Recorrencia = (typeof RECORRENCIA_OPCOES)[number];

export function recorrenciaLabel(r: string): string {
  if (r === "Diária") return "Repete todo dia";
  if (r === "Semanal") return "Repete toda semana";
  if (r === "Mensal") return "Repete todo mês";
  return "Não se repete";
}

// Visibilidade decide quem consegue ver o evento (área pública, mural do
// Portal, calendário) — ver publicoAlvoEvento() abaixo pra tradução em
// funções de parceiros.parceiros.funcao permitidas.
export const VISIBILIDADE_OPCOES = ["Publico", "Fechado administrativo", "Fechado corretores", "Interno"] as const;
export type Visibilidade = (typeof VISIBILIDADE_OPCOES)[number];

export function visibilidadeLabel(v: string): string {
  if (v === "Fechado administrativo") return "Fechado — só administrativo";
  if (v === "Fechado corretores") return "Fechado — só corretores";
  if (v === "Interno") return "Interno (administrativo + corretores)";
  return "Público";
}

// Quais funções de parceiros.funcao enxergam o evento no Portal, de acordo
// com a visibilidade escolhida — é o "puxar a lista" pedido pelo usuário:
// em vez de escolher pessoa por pessoa, a visibilidade já resolve sozinha
// quem é elegível (Administrativo, Corretor, Corretor Estagiário).
// "Publico" devolve null porque não é restrito a nenhuma função — todo
// mundo (inclusive visitante não logado, na área pública) pode ver.
export function funcoesPermitidas(visibilidade: string): string[] | null {
  if (visibilidade === "Fechado administrativo") return ["Administrativo"];
  if (visibilidade === "Fechado corretores") return ["Corretor", "Corretor Estagiário"];
  if (visibilidade === "Interno") return ["Administrativo", "Corretor", "Corretor Estagiário"];
  return null;
}

// Um parceiro (pela função) consegue ver este evento? Admin (isAdm) sempre
// vê tudo — essa checagem é só pro Portal do Corretor/área pública.
export function podeVerEvento(visibilidade: string, funcaoDoParceiro: string | null): boolean {
  const permitidas = funcoesPermitidas(visibilidade);
  if (permitidas === null) return true;
  if (!funcaoDoParceiro) return false;
  return permitidas.includes(funcaoDoParceiro);
}

export const STATUS_CONFIRMACAO_OPCOES = ["Pendente", "Confirmado", "Recusado"] as const;
export type StatusConfirmacao = (typeof STATUS_CONFIRMACAO_OPCOES)[number];

// Fase 3 (pedido do usuário, 10/08/2026) — qual formulário de inscrição
// pública fica aberto na página do evento pra convidado externo (sem
// login). "" = nenhum (não mostra formulário nenhum). O Completo pede mais
// campos que o Básico — ver eventos_inscricoes no schema.
export const FORMULARIO_INSCRICAO_OPCOES = ["", "Basico", "Completo"] as const;
export type FormularioInscricao = (typeof FORMULARIO_INSCRICAO_OPCOES)[number];

export function formularioInscricaoLabel(f: string | null): string {
  if (f === "Basico") return "Formulário básico";
  if (f === "Completo") return "Formulário completo";
  return "Nenhum";
}

// Cobrança por convidado (Fase 6, 12/08/2026) — "cobrar por cabeça, criança
// até 14 anos não paga". Sem idade informada, trata como pagante (mais
// seguro pro controle financeiro cobrar de mais do que deixar passar de
// graça por falta de dado — o admin sempre pode ajustar manualmente).
export function convidadoPaga(idade: number | null, idadeGratisAte: number | null): boolean {
  if (idade === null) return true;
  const limite = idadeGratisAte ?? 14;
  return idade > limite;
}

export function valorDevidoConvidado(
  idade: number | null,
  idadeGratisAte: number | null,
  valorConvidado: number | null
): number {
  if (!convidadoPaga(idade, idadeGratisAte)) return 0;
  return valorConvidado ?? 0;
}

// Pagamento do evento em si — pra equipe que confirma presença (Fase 7,
// 14/08/2026: "vamos consolidar o pagamento dessa forma. Sempre que algum
// evento criado e tiver pagamento vamos chamar essa geração de pix por
// enquanto e controle de pagamento manual"). Até aqui eventos.pago/valor
// eram só informativos (ver comentário em prisma/schema.prisma) — agora
// viram cobrança de verdade (Pix estático + eventos_confirmacoes.pago
// marcado à mão), então precisam das mesmas duas perguntas que já existiam
// pra convidado: "quanto" e "quem paga".

// Quanto — considera o desconto por antecedência (tem_desconto/
// valor_desconto/desconto_prazo) que já existia só como texto solto na
// página pública ("Investimento: R$X · com desconto: R$Y até DATA") sem
// nunca ter sido de fato calculado em lugar nenhum. Fora do prazo (ou sem
// desconto configurado), vale o valor cheio.
export function valorEventoAgora(
  valor: number | null,
  temDesconto: boolean,
  valorDesconto: number | null,
  descontoPrazo: Date | null,
  agora: Date
): number | null {
  if (temDesconto && valorDesconto !== null && descontoPrazo && agora <= descontoPrazo) {
    return valorDesconto;
  }
  return valor;
}

// Quem paga — regra por função (eventos.pago_funcoes_isentas) com override
// por pessoa específica (eventos_confirmacoes.pago_isento): null segue a
// regra da função; true/false força isento/pagante pra aquela pessoa,
// independente da função. Pedido do usuário ao ser perguntado se dava pra
// isentar por função: "os dois juntos".
export function confirmacaoIsenta(
  funcao: string | null,
  funcoesIsentas: string[],
  overrideIsento: boolean | null
): boolean {
  if (overrideIsento !== null && overrideIsento !== undefined) return overrideIsento;
  if (!funcao) return false;
  return funcoesIsentas.includes(funcao);
}
