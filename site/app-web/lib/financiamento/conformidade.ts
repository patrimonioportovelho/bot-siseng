import type { ColunaFinId } from "@/lib/financiamento/quadro";

// Conformidade e checklists do Financiamento.
//
// Não existe um padrão único de processo: o que vale são as regras da lei e
// os manuais da Caixa (que mudam por circular). Este arquivo transforma essas
// regras num checklist operacional por etapa, pra medir conformidade e
// inconformidade. Referências usadas:
//  - Lei 4.380/1964 (SFH): limite de comprometimento de renda e juros da
//    habitação;
//  - Lei 9.514/1997 (SFI): alienação fiduciária — o imóvel é a garantia até a
//    quitação (contrato + registro na matrícula);
//  - Lei 8.036/1990 e Manual do FGTS – Moradia Própria: uso do FGTS;
//  - CMN/Banco Central: percentual máximo financiado sobre o valor de
//    avaliação (LTV) por linha;
//  - Manuais de Habitação PF da Caixa: vistoria de engenharia, comprovação de
//    renda (inclusive autônomos) e análise jurídica de certidões.
// Os limites abaixo são REFERÊNCIAS ajustáveis — confirme na versão vigente do
// manual/circular da Caixa antes de orientar o cliente.

export const LIMITE_COMPROMETIMENTO_RENDA = 0.3; // prestação ÷ renda bruta (SFH)
export const LIMITE_FINANCIAMENTO_SOBRE_AVALIACAO = 0.8; // referência SBPE; varia por produto

export type ItemChecklist = { chave: string; titulo: string; ref?: string; soSeFgts?: boolean };
export type GrupoChecklist = { id: string; coluna: ColunaFinId; titulo: string; itens: ItemChecklist[] };

export const GRUPOS_CHECKLIST: GrupoChecklist[] = [
  {
    id: "credito",
    coluna: "montagem",
    titulo: "Levantamento de crédito",
    itens: [
      { chave: "cred_cpf", titulo: "CPF consultado e sem restrição impeditiva" },
      { chave: "cred_renda", titulo: "Renda comprovada (holerite, extratos, IR; autônomo conforme o manual)", ref: "Manuais de Habitação PF" },
      { chave: "cred_comprometimento", titulo: "Comprometimento de renda dentro do limite", ref: "Lei 4.380/64 (SFH)" },
      { chave: "cred_ltv", titulo: "Valor financiado dentro do limite sobre a avaliação do imóvel", ref: "CMN / SBPE" },
      {
        chave: "cred_fgts",
        titulo: "Elegibilidade do FGTS conferida (tempo de trabalho, sem outro imóvel residencial no município, intervalo entre usos)",
        ref: "Lei 8.036/90 · Manual FGTS Moradia Própria",
        soSeFgts: true
      },
      { chave: "cred_validade", titulo: "Validade da aprovação acompanhada" }
    ]
  },
  {
    id: "documentacao",
    coluna: "documentacao",
    titulo: "Documentação — comprador",
    itens: [
      { chave: "comp_identidade", titulo: "Documento de identidade e CPF" },
      { chave: "comp_estado_civil", titulo: "Certidão de estado civil (com averbações, se houver)" },
      { chave: "comp_residencia", titulo: "Comprovante de residência atualizado" },
      { chave: "comp_renda", titulo: "Comprovantes de renda atualizados" },
      { chave: "comp_fgts_extrato", titulo: "Extrato do FGTS", soSeFgts: true }
    ]
  },
  {
    id: "documentacao_vendedor",
    coluna: "documentacao",
    titulo: "Documentação — vendedor",
    itens: [
      { chave: "vend_documentos", titulo: "Documentos pessoais do vendedor" },
      { chave: "vend_estado_civil", titulo: "Certidão de estado civil e averbações do vendedor" },
      { chave: "vend_certidoes", titulo: "Certidões negativas do vendedor" }
    ]
  },
  {
    id: "documentacao_imovel",
    coluna: "documentacao",
    titulo: "Documentação — imóvel",
    itens: [
      { chave: "imov_matricula", titulo: "Matrícula atualizada com certidão de ônus reais" },
      { chave: "imov_iptu", titulo: "IPTU quitado / certidão negativa municipal" },
      { chave: "imov_habitese", titulo: "Habite-se e averbação da construção" },
      { chave: "imov_condominio", titulo: "Declaração de quitação de condomínio (quando houver)" }
    ]
  },
  {
    id: "engenharia",
    coluna: "engenharia",
    titulo: "Engenharia",
    itens: [
      { chave: "eng_boleto", titulo: "Taxa de avaliação (boleto) paga" },
      { chave: "eng_agendamento", titulo: "Vistoria agendada com o engenheiro" },
      { chave: "eng_vistoria", titulo: "Vistoria realizada" },
      { chave: "eng_laudo", titulo: "Laudo incluído no sistema do banco (Siopi)" }
    ]
  },
  {
    id: "conformidade",
    coluna: "conformidade",
    titulo: "Conformidade (análise documental e jurídica)",
    itens: [
      { chave: "conf_documental", titulo: "Conferência documental completa" },
      { chave: "conf_juridica", titulo: "Análise jurídica das certidões e da matrícula" },
      { chave: "conf_valores", titulo: "Valores conferidos (compra e venda × avaliação × financiamento)" }
    ]
  },
  {
    id: "comite",
    coluna: "comite",
    titulo: "Comitê e dotação",
    itens: [
      { chave: "com_comite", titulo: "Aprovação do comitê/alçada" },
      { chave: "com_dotacao", titulo: "Dotação orçamentária confirmada (subsídio / FGTS)" }
    ]
  },
  {
    id: "contrato",
    coluna: "contrato",
    titulo: "Contrato",
    itens: [
      { chave: "ctr_minuta", titulo: "Minuta conferida com as partes" },
      { chave: "ctr_assinatura", titulo: "Contrato assinado com alienação fiduciária", ref: "Lei 9.514/97" },
      { chave: "ctr_conta", titulo: "Conta aberta (quando exigida)" }
    ]
  },
  {
    id: "registro",
    coluna: "registro",
    titulo: "Registro",
    itens: [
      { chave: "reg_protocolo", titulo: "Contrato protocolado no cartório" },
      { chave: "reg_exigencia", titulo: "Nota de exigência do cartório atendida (se houver)" },
      { chave: "reg_registro", titulo: "Registro e alienação fiduciária averbados na matrícula", ref: "Lei 9.514/97" },
      { chave: "reg_entrega", titulo: "Documentação entregue ao gerente" }
    ]
  }
];

export const TODOS_ITENS_CHECKLIST: ItemChecklist[] = GRUPOS_CHECKLIST.flatMap((g) => g.itens);
export const CHAVES_CHECKLIST = new Set(TODOS_ITENS_CHECKLIST.map((i) => i.chave));

export type EstadoChecklist = Record<string, { feito: boolean; data?: string }>;

// ---- Inconformidade ----
export const MOTIVOS_INCONFORMIDADE = [
  "Documentação do comprador incompleta ou ilegível",
  "Documentação do vendedor incompleta ou desatualizada",
  "Renda não comprovada ou divergente",
  "Estado civil / averbação pendente",
  "Matrícula do imóvel com pendência (ônus ou averbação)",
  "Certidões ausentes ou vencidas",
  "Laudo de engenharia com ressalva",
  "Divergência de valores (avaliação × compra e venda × financiamento)",
  "Restrição cadastral (CPF, Serasa, CCF)",
  "Comprometimento de renda acima do limite",
  "FGTS não elegível ou extrato pendente",
  "Dados cadastrais divergentes",
  "Nota de exigência do cartório",
  "Outro"
];

// ---- Verificações automáticas (com os dados que o sistema já tem) ----
export type VerificacaoAutomatica = {
  chave: string;
  titulo: string;
  situacao: "ok" | "alerta" | "sem_dados";
  detalhe: string;
};

function pct(n: number) {
  return `${(n * 100).toFixed(1).replace(".", ",")}%`;
}
function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function verificacoesAutomaticas(d: {
  rendaTotal: number | null; // soma da renda bruta do cliente e dos participantes
  prestacao: number | null;
  valorFinanciamento: number | null;
  valorAvaliado: number | null;
  dataValidade: string | null; // yyyy-mm-dd
  hoje: string; // yyyy-mm-dd
  diasAlertaValidade: number;
}): VerificacaoAutomatica[] {
  const itens: VerificacaoAutomatica[] = [];

  if (d.rendaTotal && d.rendaTotal > 0 && d.prestacao && d.prestacao > 0) {
    const razao = d.prestacao / d.rendaTotal;
    itens.push({
      chave: "comprometimento",
      titulo: "Comprometimento de renda",
      situacao: razao <= LIMITE_COMPROMETIMENTO_RENDA ? "ok" : "alerta",
      detalhe: `Prestação ${brl(d.prestacao)} ÷ renda ${brl(d.rendaTotal)} = ${pct(razao)} (limite de referência ${pct(LIMITE_COMPROMETIMENTO_RENDA)})`
    });
  } else {
    itens.push({
      chave: "comprometimento",
      titulo: "Comprometimento de renda",
      situacao: "sem_dados",
      detalhe: "Informe a renda do cliente e a prestação da avaliação para calcular."
    });
  }

  if (d.valorFinanciamento && d.valorFinanciamento > 0 && d.valorAvaliado && d.valorAvaliado > 0) {
    const razao = d.valorFinanciamento / d.valorAvaliado;
    itens.push({
      chave: "ltv",
      titulo: "Financiamento sobre o valor de avaliação",
      situacao: razao <= LIMITE_FINANCIAMENTO_SOBRE_AVALIACAO ? "ok" : "alerta",
      detalhe: `${brl(d.valorFinanciamento)} ÷ ${brl(d.valorAvaliado)} = ${pct(razao)} (limite de referência ${pct(LIMITE_FINANCIAMENTO_SOBRE_AVALIACAO)}; varia por produto)`
    });
  } else {
    itens.push({
      chave: "ltv",
      titulo: "Financiamento sobre o valor de avaliação",
      situacao: "sem_dados",
      detalhe: "Aparece quando houver valor financiado e valor avaliado do imóvel."
    });
  }

  if (d.dataValidade) {
    const dias = Math.round((new Date(`${d.dataValidade}T00:00:00Z`).getTime() - new Date(`${d.hoje}T00:00:00Z`).getTime()) / 86400000);
    itens.push({
      chave: "validade",
      titulo: "Validade da aprovação",
      situacao: dias < 0 || dias <= d.diasAlertaValidade ? "alerta" : "ok",
      detalhe: dias < 0 ? `Vencida há ${-dias} dia(s)` : `Vence em ${dias} dia(s) (${d.dataValidade.split("-").reverse().join("/")})`
    });
  }
  return itens;
}
