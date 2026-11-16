// Modelos de mensagem de WhatsApp da Ficha de Captação (imóvel sem exclusividade). O proprietário que não fechou
// exclusividade precisa ser mantido a par de cada passo: ficha, anúncio no ar, visitas e propostas. Os trechos entre
// chaves são preenchidos sozinhos ({nome}, {remetente}, {imovel}, {link_do_anuncio}); o que faltar fica entre
// colchetes para o corretor completar. Mesmo padrão do quadro de Clientes (lib/clientes/mensagens.ts).
//
// `anexo`: o WhatsApp não aceita arquivo pelo link — o corretor abre a conversa e anexa o arquivo na mão.
export type ModeloMensagemGestao = {
  id: string;
  grupo: string;
  titulo: string;
  texto: string;
  anexo?: "ficha" | "proposta";
};

const ASSINATURA = "Aqui é {remetente}.";

export const MODELOS_MENSAGEM_GESTAO: ModeloMensagemGestao[] = [
  // ---------------- Ficha de captação ----------------
  {
    id: "ficha_envio",
    grupo: "Ficha de captação",
    titulo: "Envio da ficha de captação (anexo)",
    anexo: "ficha",
    texto: `Oi, {nome}! ${ASSINATURA} Segue em anexo a ficha de captação do seu imóvel {imovel}, com os dados e as condições que combinamos. Dá uma conferida e me diga se está tudo certo; qualquer ajuste, é só me avisar.`
  },
  {
    id: "ficha_acompanhar",
    grupo: "Ficha de captação",
    titulo: "Perguntar se conferiu a ficha",
    texto: `Oi, {nome}, tudo bem? ${ASSINATURA} Conseguiu conferir a ficha de captação do imóvel {imovel} que te enviei? Se estiver tudo certo, já sigo com a divulgação.`
  },
  // ---------------- Anúncio / Comercialização ----------------
  {
    id: "anuncio_link",
    grupo: "Anúncio e comercialização",
    titulo: "Envio do link do anúncio",
    texto: `Oi, {nome}! 🎉 ${ASSINATURA} O seu imóvel {imovel} já está anunciado no site! Link do anúncio: {link_do_anuncio}. Vou te mantendo informado sobre os interessados e as visitas.`
  },
  {
    id: "anuncio_atualizacao",
    grupo: "Anúncio e comercialização",
    titulo: "Atualização da divulgação",
    texto: `Oi, {nome}! ${ASSINATURA} Passando para te atualizar sobre a divulgação do imóvel {imovel}: [contar o andamento: contatos recebidos, acessos ao anúncio]. Seguimos divulgando e te aviso de qualquer novidade.`
  },
  // ---------------- Visitas ----------------
  {
    id: "visita_agendada",
    grupo: "Visitas",
    titulo: "Aviso de visita agendada",
    texto: `Oi, {nome}! ${ASSINATURA} Tenho uma visita agendada no seu imóvel {imovel} para {data_e_horario}. Pode ficar tudo certo para receber o interessado? Se precisar mudar o horário, me avise.`
  },
  {
    id: "visita_retorno",
    grupo: "Visitas",
    titulo: "Retorno da visita",
    texto: `Oi, {nome}! ${ASSINATURA} Fizemos a visita no imóvel {imovel} e o retorno do interessado foi: [contar o retorno da visita]. Continuo te atualizando a cada passo.`
  },
  // ---------------- Propostas ----------------
  {
    id: "proposta_recebida",
    grupo: "Propostas",
    titulo: "Proposta recebida (anexo)",
    anexo: "proposta",
    texto: `Oi, {nome}! ${ASSINATURA} Recebi uma proposta para o seu imóvel {imovel}. Segue em anexo para você avaliar. Podemos conversar sobre os valores e as condições?`
  },
  {
    id: "proposta_retorno",
    grupo: "Propostas",
    titulo: "Retorno da negociação",
    texto: `Oi, {nome}! ${ASSINATURA} Sobre a proposta do imóvel {imovel}: [contar o retorno da negociação]. Qual você prefere como próximo passo?`
  },
  // ---------------- Livre ----------------
  {
    id: "livre",
    grupo: "Geral",
    titulo: "Mensagem livre",
    texto: `Oi, {nome}! ${ASSINATURA} `
  }
];

export const MODELO_GESTAO_POR_ID = new Map(MODELOS_MENSAGEM_GESTAO.map((m) => [m.id, m]));

const SUGERIDO: Record<string, string> = {
  captacao_ficha: "ficha_envio",
  comercializacao: "anuncio_link",
  visitas: "visita_agendada",
  proposta_negociacao: "proposta_recebida"
};

// Modelo sugerido pela coluna do quadro em que o card está.
export function modeloSugeridoGestao(coluna: string): string {
  return SUGERIDO[coluna] ?? "livre";
}
