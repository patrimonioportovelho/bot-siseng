import type { ColunaFinId } from "@/lib/financiamento/quadro";

// Modelos de mensagem de WhatsApp do Financiamento. O destinatário pode ser o
// Cliente, o Parceiro (corretor responsável pelo cliente) ou o Vendedor (quando
// há documentos do lado dele). Os trechos entre chaves são preenchidos
// automaticamente; o que faltar fica entre colchetes pra quem envia completar.
export type DestinatarioMensagem = "cliente" | "parceiro" | "vendedor";

export type ModeloMensagemFin = {
  id: string;
  destinatario: DestinatarioMensagem;
  titulo: string;
  texto: string;
};

const ASSINATURA = "Aqui é {remetente}, da RE/MAX Engimob.";

export const MODELOS_MENSAGEM_FIN: ModeloMensagemFin[] = [
  // ---------------- Cliente ----------------
  {
    id: "cli_cpf",
    destinatario: "cliente",
    titulo: "Consulta de CPF — dados e documentos",
    texto: `Oi, {nome}! ${ASSINATURA} Recebi a sua solicitação de crédito para o financiamento. Para fazer a consulta e montar o seu processo, preciso de: documento com foto, CPF, comprovante de residência e comprovante de renda. Pode me enviar por aqui?`
  },
  {
    id: "cli_montagem",
    destinatario: "cliente",
    titulo: "Montagem de processo — documentos de renda",
    texto: `Oi, {nome}! ${ASSINATURA} Estou montando o seu processo de crédito no {banco}. Para fechar essa etapa falta: [documentos que faltam]. Consegue me enviar até {prazo}?`
  },
  {
    id: "cli_restricao",
    destinatario: "cliente",
    titulo: "Restrição no cadastro",
    texto: `Oi, {nome}! ${ASSINATURA} Na análise de crédito apareceu uma restrição no seu cadastro, e ela precisa ser regularizada para o financiamento seguir. Posso te orientar no passo a passo? Quando estiver resolvido, me avisa que refaço a consulta.`
  },
  {
    id: "cli_standbye",
    destinatario: "cliente",
    titulo: "Processo em espera (standbye)",
    texto: `Oi, {nome}! ${ASSINATURA} O seu processo de financiamento está em espera. Quando quiser retomar, é só me chamar por aqui que seguimos de onde paramos. Tem alguma novidade sobre o imóvel?`
  },
  {
    id: "cli_condicionado",
    destinatario: "cliente",
    titulo: "Aprovado com condição",
    texto: `Oi, {nome}! ${ASSINATURA} Seu crédito no {banco} foi aprovado com uma condição a cumprir: [condição]. Vamos providenciar? Me diz como posso ajudar.`
  },
  {
    id: "cli_aprovado",
    destinatario: "cliente",
    titulo: "Crédito aprovado",
    texto: `Oi, {nome}! 🎉 ${ASSINATURA} Seu crédito no {banco} foi aprovado! A aprovação vale até {validade}. Já escolheu o imóvel? Assim que me passar os dados, iniciamos o processo de financiamento.`
  },
  {
    id: "cli_documentacao",
    destinatario: "cliente",
    titulo: "Documentação do financiamento",
    texto: `Oi, {nome}! ${ASSINATURA} Para dar andamento ao financiamento do imóvel {imovel}, estamos aguardando: [documentos]. Consegue me enviar até {prazo}?`
  },
  {
    id: "cli_engenharia",
    destinatario: "cliente",
    titulo: "Engenharia — vistoria e taxa",
    texto: `Oi, {nome}! ${ASSINATURA} Chegamos na etapa de engenharia: o banco precisa avaliar o imóvel {imovel}. [Pagar o boleto da taxa de avaliação / combinar o dia da vistoria com o engenheiro]. Qualquer dúvida me chama.`
  },
  {
    id: "cli_inconforme",
    destinatario: "cliente",
    titulo: "Pendência apontada pelo banco (inconformidade)",
    texto: `Oi, {nome}! ${ASSINATURA} O banco apontou uma pendência no seu processo: {pendencia}. Precisamos resolver para seguir com o financiamento. Posso contar com você para [o que precisa ser feito]?`
  },
  {
    id: "cli_comite",
    destinatario: "cliente",
    titulo: "Em análise final (comitê)",
    texto: `Oi, {nome}! ${ASSINATURA} O seu processo está na análise final do banco (comitê). Assim que houver retorno, aviso você por aqui.`
  },
  {
    id: "cli_contrato",
    destinatario: "cliente",
    titulo: "Assinatura do contrato",
    texto: `Oi, {nome}! 🎉 ${ASSINATURA} Seu contrato de financiamento está pronto para assinatura! Vamos agendar? Qual dia e horário ficam melhores para você?`
  },
  {
    id: "cli_registro",
    destinatario: "cliente",
    titulo: "Contrato assinado — registro em cartório",
    texto: `Oi, {nome}! ${ASSINATURA} Contrato assinado! Agora o cartório registra o contrato e a alienação fiduciária na matrícula do imóvel. Te aviso a cada passo e, se o cartório pedir algo, já te falo.`
  },
  {
    id: "cli_concluido",
    destinatario: "cliente",
    titulo: "Financiamento concluído",
    texto: `Oi, {nome}! 🏠 ${ASSINATURA} Parabéns, seu financiamento foi concluído! Foi um prazer acompanhar a conquista do seu imóvel. Se precisar de qualquer coisa, estamos por aqui.`
  },
  {
    id: "cli_vencida",
    destinatario: "cliente",
    titulo: "Aprovação vencida — renovar",
    texto: `Oi, {nome}! ${ASSINATURA} A sua aprovação de crédito venceu. Se você ainda quer financiar, posso refazer a consulta para você. Vamos retomar?`
  },
  {
    id: "cli_livre",
    destinatario: "cliente",
    titulo: "Mensagem livre",
    texto: `Oi, {nome}! ${ASSINATURA} `
  },
  // ---------------- Parceiro (corretor responsável) ----------------
  {
    id: "par_status",
    destinatario: "parceiro",
    titulo: "Atualização do financiamento do cliente",
    texto: `Oi, {nome}! ${ASSINATURA} Atualização do financiamento de {cliente}: o processo está em "{etapa}". Próximo passo: {proximo_passo}. Qualquer coisa me chama.`
  },
  {
    id: "par_pendencia",
    destinatario: "parceiro",
    titulo: "Preciso da sua ajuda com uma pendência",
    texto: `Oi, {nome}! ${ASSINATURA} No financiamento de {cliente} temos uma pendência: {pendencia}. Você consegue ajudar a resolver com o cliente? Isso destrava a próxima etapa.`
  },
  {
    id: "par_documentos",
    destinatario: "parceiro",
    titulo: "Documentos do cliente em falta",
    texto: `Oi, {nome}! ${ASSINATURA} Para seguir com o financiamento de {cliente} ainda faltam estes documentos: [documentos]. Pode cobrar do cliente até {prazo}?`
  },
  {
    id: "par_validade",
    destinatario: "parceiro",
    titulo: "Aprovação perto de vencer",
    texto: `Oi, {nome}! ${ASSINATURA} A aprovação de crédito de {cliente} vence em {validade}. Se ele já tiver o imóvel, precisamos iniciar o processo antes disso. Como estamos?`
  },
  {
    id: "par_aprovado",
    destinatario: "parceiro",
    titulo: "Crédito do cliente aprovado",
    texto: `Oi, {nome}! 🎉 ${ASSINATURA} O crédito de {cliente} no {banco} foi aprovado (válido até {validade}). Já tem imóvel em vista? Me passa os dados para iniciarmos.`
  },
  {
    id: "par_restricao",
    destinatario: "parceiro",
    titulo: "Restrição ou reprovação do cliente",
    texto: `Oi, {nome}! ${ASSINATURA} O crédito de {cliente} teve um impeditivo na análise ({pendencia}). Vale conversar com ele sobre como regularizar. Posso te explicar os detalhes quando puder.`
  },
  {
    id: "par_concluido",
    destinatario: "parceiro",
    titulo: "Financiamento concluído",
    texto: `Oi, {nome}! 🏠 ${ASSINATURA} O financiamento de {cliente} foi concluído! Parabéns pelo fechamento. Obrigada pela parceria.`
  },
  {
    id: "par_livre",
    destinatario: "parceiro",
    titulo: "Mensagem livre",
    texto: `Oi, {nome}! ${ASSINATURA} Sobre o financiamento de {cliente}: `
  },
  // ---------------- Vendedor ----------------
  {
    id: "ven_documentos",
    destinatario: "vendedor",
    titulo: "Documentos do vendedor e do imóvel",
    texto: `Oi, {nome}! ${ASSINATURA} Estou acompanhando a venda do imóvel {imovel}, que será financiada pelo comprador. Para o banco aprovar, preciso dos documentos do vendedor e do imóvel: [documentos]. Consegue me enviar até {prazo}?`
  },
  {
    id: "ven_livre",
    destinatario: "vendedor",
    titulo: "Mensagem livre",
    texto: `Oi, {nome}! ${ASSINATURA} Sobre a venda do imóvel {imovel}: `
  }
];

export const MODELO_FIN_POR_ID = new Map(MODELOS_MENSAGEM_FIN.map((m) => [m.id, m]));

// Modelo sugerido conforme a coluna do card, o destinatário e a situação.
export function modeloSugeridoFin(params: {
  coluna: ColunaFinId;
  destinatario: DestinatarioMensagem;
  inconformidadeAberta: boolean;
  statusAvaliacao: string;
}): string {
  const { coluna, destinatario, inconformidadeAberta, statusAvaliacao } = params;
  if (destinatario === "vendedor") return "ven_documentos";

  if (destinatario === "parceiro") {
    if (inconformidadeAberta) return "par_pendencia";
    if (coluna === "aprovado") return "par_aprovado";
    if (coluna === "restricao" || statusAvaliacao === "Reprovação") return "par_restricao";
    if (coluna === "concluido") return "par_concluido";
    return "par_status";
  }

  // cliente
  if (inconformidadeAberta) return "cli_inconforme";
  if (statusAvaliacao === "Avaliação vencida") return "cli_vencida";
  const mapa: Partial<Record<ColunaFinId, string>> = {
    cpf: "cli_cpf",
    montagem: "cli_montagem",
    restricao: "cli_restricao",
    standbye: "cli_standbye",
    condicionado: "cli_condicionado",
    aprovado: "cli_aprovado",
    documentacao: "cli_documentacao",
    engenharia: "cli_engenharia",
    conformidade: "cli_comite",
    comite: "cli_comite",
    contrato: "cli_contrato",
    registro: "cli_registro",
    concluido: "cli_concluido",
    encerrado: "cli_livre"
  };
  return mapa[coluna] ?? "cli_livre";
}
