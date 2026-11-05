// Quadro (Kanban) de Clientes — 05/11/2026. Arquivo puro (sem banco): a etapa de cada
// cliente é CALCULADA a partir do que já existe no sistema, então o quadro e a lista
// sempre concordam. Cliente novo cadastrado pelo corretor no portal já nasce em
// "Leads"; ao ganhar um imóvel, contrato, proposta ou avaliação, muda de coluna sozinho.

export type EtapaFunilId =
  | "leads"
  | "proprietarios"
  | "inquilinos"
  | "compradores"
  | "atendimento"
  | "proposta"
  | "negocio";

export type EtapaFunil = {
  id: EtapaFunilId;
  label: string;
  dica: string;
  cor: string;
  // arrastar para esta coluna muda o cliente? (só Leads <-> Em atendimento; o resto é automático)
  manual: boolean;
};

// Na ordem das colunas do quadro.
export const ETAPAS_FUNIL: EtapaFunil[] = [
  { id: "leads", label: "Leads", dica: "Só cadastrados: ainda sem imóvel, contrato, proposta ou avaliação.", cor: "bg-gray-100 text-gray-700 border-gray-200", manual: true },
  { id: "proprietarios", label: "Proprietários", dica: "Têm imóvel, administração ou venda como proprietário.", cor: "bg-indigo-50 text-indigo-700 border-indigo-200", manual: false },
  { id: "inquilinos", label: "Inquilinos", dica: "Com contrato de locação ativo.", cor: "bg-teal-50 text-teal-700 border-teal-200", manual: false },
  { id: "compradores", label: "Compradores", dica: "Compraram: contrato de compra e venda finalizado.", cor: "bg-sky-50 text-sky-700 border-sky-200", manual: false },
  { id: "atendimento", label: "Em atendimento", dica: "Sendo atendidos: marcados pelo administrativo ou com avaliação de crédito em andamento.", cor: "bg-amber-50 text-amber-700 border-amber-200", manual: true },
  { id: "proposta", label: "Proposta criada", dica: "Proposta feita nos últimos 60 dias.", cor: "bg-orange-50 text-orange-700 border-orange-200", manual: false },
  { id: "negocio", label: "Negócio fechado", dica: "Contrato (locação ou compra e venda) em elaboração.", cor: "bg-green-50 text-green-700 border-green-200", manual: false }
];

export const ETAPA_FUNIL_POR_ID = new Map(ETAPAS_FUNIL.map((e) => [e.id, e]));

export const DIAS_PROPOSTA_RECENTE = 60;

// Locação "ativa" = contrato rodando. Compra e Venda "finalizada" = comprador de fato.
export const STATUS_LOCACAO_ATIVA = ["Imóvel em Locação", "Imóvel em locação sem administração"];
// Locação finalizada sem administração: continua valendo enquanto o contrato estiver no prazo (data de vencimento).
export const STATUS_LOCACAO_SEM_ADM = "Transação Finalizada sem administração";
export const STATUS_COMPRA_FINALIZADA = ["Transação Finalizada"];
export const prefixoElaboracao = "Elaboração";

// O que o sistema sabe sobre o cliente.
export type SinaisCliente = {
  // vínculo de proprietário: imóvel, administração, gestão, ou lado proprietário/vendedor de uma transação
  proprietario: boolean;
  locacaoAtiva: boolean;
  compraFinalizada: boolean;
  // contrato em elaboração como locatário/comprador (negócio fechado)
  contratoEmElaboracao: string | null; // "Locação" | "Compra e Venda"
  propostaEm: Date | null;
  avaliacaoAtiva: string | null; // status da avaliação em andamento
  avaliacaoEm: Date | null; // quando essa avaliação foi aberta
  // quando o contrato mais recente do cliente (como locatário/comprador) foi criado: proposta e avaliação
  // anteriores a ele já deram resultado (viraram o contrato) e não seguram mais o cliente nessas etapas
  contratoEm: Date | null;
  atendimentoManual: boolean;
};

export type Derivacao = {
  etapa: EtapaFunilId;
  // por que está nessa coluna (aparece no card e na etiqueta)
  motivo: string;
  // todos os papéis do cliente, mesmo os que não definiram a coluna
  papeis: string[];
  // quando o cliente só está em "Em atendimento" por marcação manual, dá para devolvê-lo a Leads
  voltaParaLeads: boolean;
};

const dataCurta = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Porto_Velho" });

// Ordem de prioridade (a primeira que valer define a coluna): o que está acontecendo agora
// pesa mais do que o que o cliente já é.
//   Negócio fechado > Proposta criada > Em atendimento > Proprietário > Inquilino > Comprador > Lead
export function derivarEtapa(s: SinaisCliente, agora: Date = new Date()): Derivacao {
  const papeis: string[] = [];
  if (s.proprietario) papeis.push("Proprietário");
  if (s.locacaoAtiva) papeis.push("Inquilino");
  if (s.compraFinalizada) papeis.push("Comprador");

  // só vale o que veio DEPOIS do contrato mais recente (quem já fechou e começa um novo processo volta ao funil)
  const depoisDoContrato = (d: Date | null) => d !== null && (s.contratoEm === null || d.getTime() > s.contratoEm.getTime());
  const propostaValida = depoisDoContrato(s.propostaEm) && agora.getTime() - (s.propostaEm as Date).getTime() <= DIAS_PROPOSTA_RECENTE * 86400000;
  const avaliacaoValida = s.avaliacaoAtiva !== null && depoisDoContrato(s.avaliacaoEm);
  const resultado = (etapa: EtapaFunilId, motivo: string, voltaParaLeads = false): Derivacao => ({ etapa, motivo, papeis, voltaParaLeads });

  if (s.contratoEmElaboracao) return resultado("negocio", `Contrato de ${s.contratoEmElaboracao} em elaboração`);
  if (propostaValida && s.propostaEm) return resultado("proposta", `Proposta criada em ${dataCurta(s.propostaEm)}`);
  if (avaliacaoValida) return resultado("atendimento", `Avaliação em andamento: ${s.avaliacaoAtiva}`);
  if (s.atendimentoManual) return resultado("atendimento", "Marcado em atendimento", true);
  if (s.proprietario) return resultado("proprietarios", "Vínculo de proprietário");
  if (s.locacaoAtiva) return resultado("inquilinos", "Contrato de locação ativo");
  if (s.compraFinalizada) return resultado("compradores", "Compra e venda finalizada");
  return resultado("leads", "Apenas cadastrado");
}

// Onde dá para soltar um card: só Leads <-> Em atendimento (as outras colunas são automáticas).
export function movimentoPermitido(d: Derivacao, destino: EtapaFunilId): { ok: true } | { ok: false; erro: string } {
  if (destino === d.etapa) return { ok: true };
  if (destino === "atendimento") {
    if (d.etapa === "leads") return { ok: true };
    return { ok: false, erro: "Só quem está em Leads pode ser marcado como Em atendimento. As demais etapas mudam sozinhas." };
  }
  if (destino === "leads") {
    if (d.etapa === "atendimento" && d.voltaParaLeads) return { ok: true };
    if (d.etapa === "atendimento") return { ok: false, erro: "Este cliente está em atendimento por causa de uma avaliação de crédito em andamento. Quando ela terminar, a etapa muda sozinha." };
    return { ok: false, erro: "Esta etapa é calculada automaticamente (vínculos, contratos e propostas do cliente) e não volta para Leads por arraste." };
  }
  const alvo = ETAPA_FUNIL_POR_ID.get(destino);
  return { ok: false, erro: `“${alvo?.label ?? destino}” é automática: o cliente entra nela sozinho quando o sistema registrar ${destino === "proposta" ? "uma proposta" : destino === "negocio" ? "um contrato em elaboração" : destino === "proprietarios" ? "um vínculo de proprietário" : destino === "inquilinos" ? "um contrato de locação ativo" : "uma compra e venda finalizada"}.` };
}
