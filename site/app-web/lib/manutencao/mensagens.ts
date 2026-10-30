// Modelos de mensagem de WhatsApp da Manutenção. O destinatário é o
// Proprietário, o Prestador de serviço ou o Inquilino (telefone digitado). Os
// trechos entre chaves são preenchidos automaticamente; o que faltar fica
// entre colchetes para quem envia completar. Mesmo padrão do Recrutamento e do
// Financiamento (lib/whatsapp.ts).
export type DestinatarioMan = "proprietario" | "prestador" | "inquilino";

export type ModeloMensagemMan = {
  id: string;
  destinatario: DestinatarioMan;
  titulo: string;
  texto: string;
};

const ASSINATURA = "Aqui é {remetente}, da RE/MAX Engimob.";

export const MODELOS_MENSAGEM_MAN: ModeloMensagemMan[] = [
  // ---------------- Proprietário ----------------
  {
    id: "pro_solicitado",
    destinatario: "proprietario",
    titulo: "Solicitação recebida",
    texto: `Oi, {nome}! ${ASSINATURA} Recebemos a solicitação de {servico} no imóvel {imovel} ({titulo}). Já estamos buscando orçamento com prestadores e, assim que tiver os valores, te passo para a sua autorização.`
  },
  {
    id: "pro_orcamento",
    destinatario: "proprietario",
    titulo: "Orçamento para autorizar",
    texto: `Oi, {nome}! ${ASSINATURA} O orçamento para {servico} no imóvel {imovel} ficou em {custo_estimado}. Você autoriza a execução? Se preferir, te passo os detalhes do que será feito antes de decidir.`
  },
  {
    id: "pro_aprovado",
    destinatario: "proprietario",
    titulo: "Autorização recebida — vamos contratar",
    texto: `Oi, {nome}! ${ASSINATURA} Obrigada pela autorização! Vamos contratar o prestador para {servico} no imóvel {imovel} e te aviso a data de início.`
  },
  {
    id: "pro_contratado",
    destinatario: "proprietario",
    titulo: "Prestador contratado",
    texto: `Oi, {nome}! ${ASSINATURA} O prestador {prestador} foi contratado para {servico} no imóvel {imovel}. Início previsto: [data]. O acesso ao imóvel fica combinado com {chave}.`
  },
  {
    id: "pro_execucao",
    destinatario: "proprietario",
    titulo: "Serviço em execução",
    texto: `Oi, {nome}! ${ASSINATURA} O serviço de {servico} no imóvel {imovel} já está em execução. Previsão de conclusão: [data]. Te aviso assim que terminar.`
  },
  {
    id: "pro_concluido",
    destinatario: "proprietario",
    titulo: "Serviço concluído",
    texto: `Oi, {nome}! 🛠️ ${ASSINATURA} O serviço de {servico} no imóvel {imovel} foi concluído! Custo final: {custo_final}. Posso te enviar as fotos e a nota do prestador. O valor entra na prestação de contas de [mês].`
  },
  {
    id: "pro_pago",
    destinatario: "proprietario",
    titulo: "Pago e encerrado",
    texto: `Oi, {nome}! ${ASSINATURA} O serviço de {servico} no imóvel {imovel} está pago e encerrado ({custo_final}). Qualquer coisa que precisar no imóvel, é só chamar.`
  },
  {
    id: "pro_atividade",
    destinatario: "proprietario",
    titulo: "Atividade agendada",
    texto: `Oi, {nome}! ${ASSINATURA} Agendamos {atividade} no imóvel {imovel} para {data_atividade}: {titulo_atividade}.{obs_atividade} Se algo não servir, me avise para ajustarmos.`
  },
  {
    id: "pro_chave",
    destinatario: "proprietario",
    titulo: "Chave do imóvel",
    texto: `Oi, {nome}! ${ASSINATURA} Sobre a chave do imóvel {imovel}: ela está com {chave}. [combinar retirada ou devolução da chave]`
  },
  {
    id: "pro_livre",
    destinatario: "proprietario",
    titulo: "Mensagem livre",
    texto: `Oi, {nome}! ${ASSINATURA} Sobre {servico} no imóvel {imovel}: `
  },
  // ---------------- Prestador ----------------
  {
    id: "pre_orcamento",
    destinatario: "prestador",
    titulo: "Pedido de orçamento",
    texto: `Oi, {nome}! ${ASSINATURA} Preciso de um orçamento para {servico} no imóvel {imovel}: {titulo}. Urgência: {urgencia}. Consegue passar para avaliar e me mandar o valor até {prazo}? Acesso ao imóvel: {chave}.`
  },
  {
    id: "pre_contratado",
    destinatario: "prestador",
    titulo: "Contratação confirmada",
    texto: `Oi, {nome}! ${ASSINATURA} O proprietário autorizou: confirmamos você para {servico} no imóvel {imovel}, valor combinado {custo_estimado}. Quando consegue começar? Acesso: {chave}.`
  },
  {
    id: "pre_execucao",
    destinatario: "prestador",
    titulo: "Como está o andamento?",
    texto: `Oi, {nome}! ${ASSINATURA} Como está o serviço no imóvel {imovel}? Qual a previsão de conclusão? Se precisar de algo da nossa parte, me avise.`
  },
  {
    id: "pre_concluido",
    destinatario: "prestador",
    titulo: "Fotos e nota do serviço",
    texto: `Oi, {nome}! ${ASSINATURA} Pode me mandar as fotos do serviço concluído no imóvel {imovel} e a nota/recibo (valor {custo_final})? Com isso fecho o seu pagamento.`
  },
  {
    id: "pre_pago",
    destinatario: "prestador",
    titulo: "Pagamento realizado",
    texto: `Oi, {nome}! ${ASSINATURA} O pagamento do serviço no imóvel {imovel} foi realizado ({custo_final}). Obrigada pela parceria!`
  },
  {
    id: "pre_atividade",
    destinatario: "prestador",
    titulo: "Atividade agendada",
    texto: `Oi, {nome}! ${ASSINATURA} Combinamos {atividade} no imóvel {imovel} para {data_atividade}: {titulo_atividade}.{obs_atividade} Você consegue? Acesso ao imóvel: {chave}.`
  },
  {
    id: "pre_chave",
    destinatario: "prestador",
    titulo: "Chave do imóvel",
    texto: `Oi, {nome}! ${ASSINATURA} Sobre a chave do imóvel {imovel}: ela está com {chave}. [combinar retirada]. Ao terminar o serviço, devolva a chave para nós, combinado?`
  },
  {
    id: "pre_livre",
    destinatario: "prestador",
    titulo: "Mensagem livre",
    texto: `Oi, {nome}! ${ASSINATURA} Sobre o serviço no imóvel {imovel}: `
  },
  // ---------------- Inquilino ----------------
  {
    id: "inq_acesso",
    destinatario: "inquilino",
    titulo: "Combinar acesso ao imóvel",
    texto: `Oi, {nome}! ${ASSINATURA} Vamos fazer o serviço de {servico} no imóvel {imovel}, e o prestador {prestador} precisa entrar. Qual dia e horário ficam melhores para você?`
  },
  {
    id: "inq_concluido",
    destinatario: "inquilino",
    titulo: "Serviço concluído — está tudo certo?",
    texto: `Oi, {nome}! ${ASSINATURA} O serviço de {servico} no imóvel {imovel} foi concluído. Ficou tudo certo? Se notar qualquer coisa, me avise.`
  },
  {
    id: "inq_atividade",
    destinatario: "inquilino",
    titulo: "Atividade agendada",
    texto: `Oi, {nome}! ${ASSINATURA} Agendamos {atividade} no imóvel {imovel} para {data_atividade}: {titulo_atividade}.{obs_atividade} Pode nos receber ou liberar o acesso? Qual horário é melhor para você?`
  },
  {
    id: "inq_chave",
    destinatario: "inquilino",
    titulo: "Chave do imóvel",
    texto: `Oi, {nome}! ${ASSINATURA} Sobre a chave do imóvel {imovel}: [combinar entrega ou retirada da chave].`
  },
  {
    id: "inq_livre",
    destinatario: "inquilino",
    titulo: "Mensagem livre",
    texto: `Oi, {nome}! ${ASSINATURA} Sobre o imóvel {imovel}: `
  }
];

export const MODELO_MAN_POR_ID = new Map(MODELOS_MENSAGEM_MAN.map((m) => [m.id, m]));

const SUGERIDO: Record<DestinatarioMan, Record<string, string>> = {
  proprietario: {
    solicitado: "pro_solicitado",
    orcamento: "pro_orcamento",
    aprovado: "pro_aprovado",
    contratado: "pro_contratado",
    em_execucao: "pro_execucao",
    concluido: "pro_concluido",
    pago: "pro_pago"
  },
  prestador: {
    solicitado: "pre_orcamento",
    orcamento: "pre_orcamento",
    aprovado: "pre_contratado",
    contratado: "pre_contratado",
    em_execucao: "pre_execucao",
    concluido: "pre_concluido",
    pago: "pre_pago"
  },
  inquilino: {
    solicitado: "inq_acesso",
    orcamento: "inq_acesso",
    aprovado: "inq_acesso",
    contratado: "inq_acesso",
    em_execucao: "inq_acesso",
    concluido: "inq_concluido",
    pago: "inq_concluido"
  }
};

const SIGLA: Record<DestinatarioMan, string> = { proprietario: "pro", prestador: "pre", inquilino: "inq" };

// Modelo para uma atividade agendada ou para falar da chave, por destinatário.
export function modeloPorAssunto(assunto: "atividade" | "chave", destinatario: DestinatarioMan): string {
  return `${SIGLA[destinatario]}_${assunto}`;
}

export function modeloSugeridoMan(coluna: string, destinatario: DestinatarioMan): string {
  return SUGERIDO[destinatario][coluna] ?? `${destinatario === "proprietario" ? "pro" : destinatario === "prestador" ? "pre" : "inq"}_livre`;
}

export const ROTULO_DESTINATARIO_MAN: Record<DestinatarioMan, string> = {
  proprietario: "Proprietário",
  prestador: "Prestador",
  inquilino: "Inquilino"
};
