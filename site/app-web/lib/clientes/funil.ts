// Quadro (Kanban) de Clientes — 05/11/2026, movimento livre em 27/11/2026. Arquivo puro (sem banco).
// A coluna de cada cliente é CALCULADA pelo que está ATIVO no sistema (o que já terminou vai para "Concluídos").
// Quem edita Clientes pode arrastar o cartão para qualquer coluna: a escolha vale até surgir um registro novo
// (contrato, proposta, avaliação ou gestão), quando o quadro volta a acompanhar o sistema sozinho.

export type EtapaFunilId =
  | "leads"
  | "proprietarios"
  | "inquilinos"
  | "compradores"
  | "atendimento"
  | "proposta"
  | "negocio"
  | "concluidos";

export type EtapaFunil = {
  id: EtapaFunilId;
  label: string;
  dica: string;
  cor: string;
};

// Na ordem das colunas do quadro.
export const ETAPAS_FUNIL: EtapaFunil[] = [
  { id: "leads", label: "Leads", dica: "Só cadastrados: ainda sem imóvel, contrato, proposta ou avaliação.", cor: "bg-gray-100 text-gray-700 border-gray-200" },
  { id: "proprietarios", label: "Proprietários", dica: "Com imóvel, administração, gestão, locação ou venda em andamento.", cor: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { id: "inquilinos", label: "Inquilinos", dica: "Com contrato de locação ativo, ou procurando alugar.", cor: "bg-teal-50 text-teal-700 border-teal-200" },
  { id: "compradores", label: "Compradores", dica: "Procurando comprar (colocados aqui por você).", cor: "bg-sky-50 text-sky-700 border-sky-200" },
  { id: "atendimento", label: "Em atendimento", dica: "Sendo atendidos ou com avaliação de crédito em andamento.", cor: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "proposta", label: "Proposta criada", dica: "Proposta feita nos últimos 60 dias.", cor: "bg-orange-50 text-orange-700 border-orange-200" },
  { id: "negocio", label: "Negócio fechado", dica: "Contrato fechado, com o processo ainda em andamento (elaboração do contrato, financiamento, registro).", cor: "bg-green-50 text-green-700 border-green-200" },
  { id: "concluidos", label: "Concluídos", dica: "Sem nada ativo: compra, venda ou locação já encerrada. Bom para pós-venda.", cor: "bg-slate-100 text-slate-700 border-slate-300" }
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
  // vínculo de proprietário (qualquer época): imóvel, administração, gestão, ou lado proprietário/vendedor
  proprietario: boolean;
  // como proprietário há algo em andamento: administração, gestão, locação ou venda ativa
  proprietarioAtivo: boolean;
  // o que já terminou ("Compra concluída", "Locação encerrada"…); null = nada concluído
  concluido: string | null;
  // data do registro mais novo (contrato, proposta, avaliação, gestão): passa na frente da coluna escolhida à mão
  eventoEm: Date | null;
  // coluna escolhida à mão (arrastando o cartão)
  manual: { etapa: string; em: Date } | null;
  locacaoAtiva: boolean;
  compraFinalizada: boolean;
  // compra e venda assinada, mas com o andamento do contrato ainda em curso (escritura, registro...)
  compraEmCurso: boolean;
  // financiamento aprovado ainda em processo (documentação, engenharia, conformidade, contrato, registro)
  financiamentoEmCurso: boolean;
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
  // a coluna foi escolhida à mão (arrastando)
  manual: boolean;
  // onde o sistema colocaria o cliente sozinho
  etapaAutomatica: EtapaFunilId;
};

const dataCurta = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Porto_Velho" });

// Ordem de prioridade (a primeira que valer define a coluna): o que está acontecendo agora pesa mais.
//   Negócio fechado > Proposta criada > Em atendimento > Proprietário ativo > Inquilino > Concluídos >
//   Proprietário (só imóvel cadastrado) > Lead
function derivarAutomatica(s: SinaisCliente, agora: Date): { etapa: EtapaFunilId; motivo: string } {
  // só vale o que veio DEPOIS do contrato mais recente (quem já fechou e começa um novo processo volta ao funil)
  const depoisDoContrato = (d: Date | null) => d !== null && (s.contratoEm === null || d.getTime() > s.contratoEm.getTime());
  const propostaValida = depoisDoContrato(s.propostaEm) && agora.getTime() - (s.propostaEm as Date).getTime() <= DIAS_PROPOSTA_RECENTE * 86400000;
  const avaliacaoValida = s.avaliacaoAtiva !== null && depoisDoContrato(s.avaliacaoEm);
  const r = (etapa: EtapaFunilId, motivo: string) => ({ etapa, motivo });

  // Negócio fechado: contrato em elaboração, ou compra e venda já assinada com o processo ainda em andamento.
  if (s.contratoEmElaboracao) return r("negocio", `Contrato de ${s.contratoEmElaboracao} em elaboração`);
  if (s.compraFinalizada && s.compraEmCurso && s.financiamentoEmCurso) return r("negocio", "Compra e venda assinada · contrato e financiamento em andamento");
  if (s.compraFinalizada && s.financiamentoEmCurso) return r("negocio", "Compra e venda assinada · financiamento em andamento");
  if (s.compraFinalizada && s.compraEmCurso) return r("negocio", "Compra e venda assinada · contrato em andamento");
  if (propostaValida && s.propostaEm) return r("proposta", `Proposta criada em ${dataCurta(s.propostaEm)}`);
  if (avaliacaoValida) return r("atendimento", `Avaliação em andamento: ${s.avaliacaoAtiva}`);
  if (s.atendimentoManual) return r("atendimento", "Marcado em atendimento");
  if (s.proprietarioAtivo) return r("proprietarios", "Proprietário com processo ativo");
  if (s.locacaoAtiva) return r("inquilinos", "Contrato de locação ativo");
  if (s.concluido) return r("concluidos", s.concluido);
  if (s.proprietario) return r("proprietarios", "Imóvel cadastrado");
  return r("leads", "Apenas cadastrado");
}

export function derivarEtapa(s: SinaisCliente, agora: Date = new Date()): Derivacao {
  const papeis: string[] = [];
  if (s.proprietario) papeis.push("Proprietário");
  if (s.locacaoAtiva) papeis.push("Inquilino");
  if (s.compraFinalizada) papeis.push("Comprador");

  const auto = derivarAutomatica(s, agora);
  const m = s.manual;
  const etapaManual = m ? ETAPAS_FUNIL.find((e) => e.id === m.etapa)?.id : undefined;
  // a escolha à mão vale até aparecer um registro mais novo que ela
  if (m && etapaManual && (!s.eventoEm || s.eventoEm.getTime() <= m.em.getTime())) {
    return { etapa: etapaManual, motivo: `Movido para cá em ${dataCurta(m.em)}`, papeis, manual: true, etapaAutomatica: auto.etapa };
  }
  return { ...auto, papeis, manual: false, etapaAutomatica: auto.etapa };
}
