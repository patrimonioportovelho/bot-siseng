import type { EtapaFunilId } from "@/lib/clientes/funil";

// Modelos de mensagem de WhatsApp do quadro de Clientes. Os trechos entre chaves são
// preenchidos sozinhos ({nome}, {remetente}, {imovel}); o que faltar fica entre
// colchetes para quem envia completar. Mesmo padrão do Recrutamento, Financiamento e
// Manutenção (lib/whatsapp.ts). Escritos para os dois lados do balcão: quem quer
// negócio (leads, atendimento, proposta) e quem já é cliente (proprietário, inquilino,
// comprador).
export type ModeloMensagemCliente = {
  id: string;
  grupo: string;
  titulo: string;
  texto: string;
};

const ASSINATURA = "Aqui é {remetente}.";

export const MODELOS_MENSAGEM_CLIENTE: ModeloMensagemCliente[] = [
  // ---------------- Leads ----------------
  {
    id: "lead_primeiro",
    grupo: "Leads",
    titulo: "Primeiro contato",
    texto: `Oi, {nome}! ${ASSINATURA} Vi que você se cadastrou com a gente e quero entender como posso te ajudar: você procura comprar, alugar, vender ou colocar um imóvel para administrar?`
  },
  {
    id: "lead_retomar",
    grupo: "Leads",
    titulo: "Retomar contato (sem resposta)",
    texto: `Oi, {nome}, tudo bem? ${ASSINATURA} Tentei falar com você há alguns dias sobre o seu cadastro. Ainda tem interesse em um imóvel? Se preferir, me diga o melhor horário para conversarmos.`
  },
  // ---------------- Em atendimento ----------------
  {
    id: "atend_acompanhar",
    grupo: "Em atendimento",
    titulo: "Acompanhamento do atendimento",
    texto: `Oi, {nome}! ${ASSINATURA} Passando para saber como estão as coisas e se posso te ajudar com mais alguma informação. Quer que eu te mande novas opções?`
  },
  {
    id: "atend_visita",
    grupo: "Em atendimento",
    titulo: "Agendar visita",
    texto: `Oi, {nome}! ${ASSINATURA} Separei o imóvel {imovel} para você conhecer. Qual dia e horário ficam melhores para a visita?`
  },
  {
    id: "atend_documentos",
    grupo: "Em atendimento",
    titulo: "Pedir documentos para o crédito",
    texto: `Oi, {nome}! ${ASSINATURA} Para avançar com a análise do seu crédito, preciso de alguns documentos: RG ou CNH, comprovante de renda, comprovante de residência e certidão de estado civil. Consegue me enviar por aqui?`
  },
  // ---------------- Proposta criada ----------------
  {
    id: "prop_acompanhar",
    grupo: "Proposta criada",
    titulo: "Acompanhar a proposta",
    texto: `Oi, {nome}! ${ASSINATURA} Registramos a sua proposta para o imóvel {imovel}. Estou acompanhando com o proprietário e te aviso assim que tiver retorno.`
  },
  {
    id: "prop_retorno",
    grupo: "Proposta criada",
    titulo: "Retorno da proposta",
    texto: `Oi, {nome}! ${ASSINATURA} Tenho novidade sobre a sua proposta para o imóvel {imovel}: [contar o retorno do proprietário]. Podemos conversar para dar o próximo passo?`
  },
  // ---------------- Negócio fechado ----------------
  {
    id: "neg_parabens",
    grupo: "Negócio fechado",
    titulo: "Parabéns e próximos passos",
    texto: `Oi, {nome}! 🎉 ${ASSINATURA} Negócio fechado, parabéns! Já estamos elaborando o contrato do imóvel {imovel}. Em breve te passo a data da assinatura e os documentos que ainda faltam.`
  },
  {
    id: "neg_assinatura",
    grupo: "Negócio fechado",
    titulo: "Combinar a assinatura",
    texto: `Oi, {nome}! ${ASSINATURA} O contrato do imóvel {imovel} está pronto para assinatura. Qual dia e horário ficam bons para você vir ao escritório?`
  },
  // ---------------- Proprietários ----------------
  {
    id: "prop_checkin",
    grupo: "Proprietários",
    titulo: "Atualização sobre o imóvel",
    texto: `Oi, {nome}! ${ASSINATURA} Passando para te atualizar sobre o seu imóvel {imovel} e saber se há algo que posso fazer por você. Tem um minutinho para conversarmos?`
  },
  {
    id: "prop_captacao",
    grupo: "Proprietários",
    titulo: "Oferecer administração ou nova captação",
    texto: `Oi, {nome}! ${ASSINATURA} Você tem algum outro imóvel que gostaria de colocar para vender, alugar ou deixar sob nossa administração? Posso te explicar como funciona, sem compromisso.`
  },
  // ---------------- Inquilinos ----------------
  {
    id: "inq_relacionamento",
    grupo: "Inquilinos",
    titulo: "Como está a locação?",
    texto: `Oi, {nome}! ${ASSINATURA} Passando para saber se está tudo certo com o imóvel {imovel} e se precisa de alguma coisa. Qualquer problema, é só me avisar.`
  },
  {
    id: "inq_renovacao",
    grupo: "Inquilinos",
    titulo: "Renovação do contrato",
    texto: `Oi, {nome}! ${ASSINATURA} O contrato de locação do imóvel {imovel} está chegando ao fim. Você tem interesse em renovar? Posso te passar as condições.`
  },
  // ---------------- Compradores ----------------
  {
    id: "comp_posvenda",
    grupo: "Compradores",
    titulo: "Pós-venda",
    texto: `Oi, {nome}! ${ASSINATURA} Passando para saber como está sendo a experiência no imóvel {imovel} e se precisa de apoio com algo. Foi um prazer fazer parte dessa conquista!`
  },
  {
    id: "comp_indicacao",
    grupo: "Compradores",
    titulo: "Pedir indicação",
    texto: `Oi, {nome}! ${ASSINATURA} Se você conhece alguém que está pensando em comprar, vender ou alugar um imóvel, ficarei muito grato(a) pela indicação. Posso cuidar com o mesmo carinho!`
  },
  // ---------------- Livre ----------------
  {
    id: "livre",
    grupo: "Geral",
    titulo: "Mensagem livre",
    texto: `Oi, {nome}! ${ASSINATURA} `
  }
];

export const MODELO_CLIENTE_POR_ID = new Map(MODELOS_MENSAGEM_CLIENTE.map((m) => [m.id, m]));

const SUGERIDO: Record<EtapaFunilId, string> = {
  leads: "lead_primeiro",
  atendimento: "atend_acompanhar",
  proposta: "prop_acompanhar",
  negocio: "neg_parabens",
  proprietarios: "prop_checkin",
  inquilinos: "inq_relacionamento",
  compradores: "comp_posvenda"
};

// Modelo sugerido pela etapa; um lead que já foi contactado e não respondeu ganha o "retomar".
export function modeloSugeridoCliente(etapa: EtapaFunilId, jaContatado: boolean): string {
  if (etapa === "leads" && jaContatado) return "lead_retomar";
  return SUGERIDO[etapa] ?? "livre";
}
