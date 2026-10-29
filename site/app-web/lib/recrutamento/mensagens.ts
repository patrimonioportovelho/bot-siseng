import type { ColunaId } from "@/lib/recrutamento/opcoes";

// Modelos de mensagem de WhatsApp do Recrutamento, no tom do processo da
// Engimob: tratamos a pessoa como interessado / futuro corretor (nunca
// "candidato" ou "vaga"), sem prometer ganho, e sempre buscando o encontro.
// Os trechos entre chaves são preenchidos automaticamente; o que faltar fica
// entre colchetes pra quem envia completar antes de abrir o WhatsApp.
export type ModeloMensagem = { id: string; titulo: string; grupo: string; texto: string };

export const MODELOS_MENSAGEM: ModeloMensagem[] = [
  {
    id: "primeiro_contato",
    grupo: "Contato inicial",
    titulo: "1º contato (lead novo)",
    texto:
      "Oi, {nome}, aqui é {remetente}, da RE/MAX Engimob. Vi que você se interessou pela carreira de corretor. Tem dois minutinhos agora? 😊\n\nO que te chamou atenção no mercado imobiliário? Vale a gente conversar 30 minutinhos para eu entender seu momento e te mostrar como funciona.\n\nFica melhor amanhã às 10h ou às 15h?"
  },
  {
    id: "retomar_contato",
    grupo: "Contato inicial",
    titulo: "Retomar contato (sem resposta)",
    texto:
      "Oi, {nome}! Aqui é {remetente}, da RE/MAX Engimob. Passando para saber se você ainda tem interesse em conhecer a carreira de corretor. Podemos marcar uma conversa de 30 minutos, online ou presencial. Qual horário fica melhor para você?"
  },
  {
    id: "confirmar_reuniao1",
    grupo: "Reuniões",
    titulo: "Confirmar 1ª reunião",
    texto:
      "Oi, {nome}! Passando para confirmar a nossa conversa {data_reuniao1}. Posso contar com você? Se precisar remarcar, é só me avisar por aqui. Até lá! 😊"
  },
  {
    id: "confirmar_reuniao2",
    grupo: "Reuniões",
    titulo: "Confirmar 2ª reunião (modelo de negócio)",
    texto:
      "Oi, {nome}! Passando para confirmar a nossa 2ª reunião {data_reuniao2}, aqui no escritório da RE/MAX Engimob. Vou apresentar o modelo de negócio e tirar todas as suas dúvidas; dura cerca de 60 minutos. Confirma presença?"
  },
  {
    id: "faltou",
    grupo: "Reuniões",
    titulo: "Faltou ou avisou que não vai",
    texto:
      "Oi, {nome}, tudo bem? Senti sua falta na nossa conversa. Aconteceu alguma coisa? Queria entender se você ainda quer seguir e, se fizer sentido, a gente remarca. Me conta por aqui ou me diz um horário que eu te ligo."
  },
  {
    id: "followup_d1",
    grupo: "Follow-up (ainda não decidiu)",
    titulo: "D+1 — agradecimento",
    texto:
      "Oi, {nome}! Obrigada pela conversa de ontem, foi muito bom te conhecer melhor. Qualquer coisa que ficar pendente, me chama por aqui. 😊"
  },
  {
    id: "followup_d3",
    grupo: "Follow-up (ainda não decidiu)",
    titulo: "D+3 — resposta a dúvidas",
    texto:
      "Oi, {nome}! Ficou alguma dúvida sobre o modelo de trabalho, a trilha de treinamento ou o dia a dia do corretor? Pode me perguntar por aqui, respondo com todo o prazer."
  },
  {
    id: "followup_d7",
    grupo: "Follow-up (ainda não decidiu)",
    titulo: "D+7 — convite para conhecer o escritório",
    texto:
      "Oi, {nome}! Que tal conhecer o escritório da RE/MAX Engimob e conversar com o time pessoalmente? Me diz o melhor dia e horário para você passar por aqui."
  },
  {
    id: "followup_d15",
    grupo: "Follow-up (ainda não decidiu)",
    titulo: "D+15 — depoimento de um corretor da casa",
    texto:
      "Oi, {nome}! Quero te mostrar o depoimento de um corretor da casa sobre como foi começar na carreira. Posso te enviar? [anexe o depoimento]"
  },
  {
    id: "followup_d30",
    grupo: "Follow-up (ainda não decidiu)",
    titulo: "D+30 — convite para a próxima turma",
    texto:
      "Oi, {nome}! Estão abertas as inscrições para a nossa próxima turma de treinamento ({turma}, início em {inicio_turma}). Se você ainda tem interesse na carreira de corretor, me avisa que eu te explico os próximos passos. As inscrições fecham 3 dias antes do início."
  },
  {
    id: "documentacao",
    grupo: "Decisão e documentação",
    titulo: "Documentação para a associação",
    texto:
      "Oi, {nome}! Para seguirmos com a sua associação à RE/MAX Engimob, preciso destes itens: documentos pessoais, CRECI (ou o plano para tirar), teste comportamental, referências e a assinatura do contrato de associação. Qual deles você já tem? Te ajudo com o que faltar."
  },
  {
    id: "turma_confirmar",
    grupo: "Treinamento",
    titulo: "Confirmar presença na turma",
    texto:
      "Oi, {nome}! Passando para confirmar sua presença no treinamento da turma {turma}: 9 Passos de {passos_inicio} a {passos_fim}, das 8h às 12h, e específicos em {especificos_a} e {especificos_b}, das 14h às 18h. A acolhida e os acessos são liberados só para quem fizer 100% das presenças. Consegue confirmar?"
  },
  {
    id: "acolhida",
    grupo: "Treinamento",
    titulo: "Convite para a acolhida",
    texto:
      "Oi, {nome}! Parabéns por concluir 100% do treinamento! 🎉 Sua acolhida será {acolhida}, na reunião de segunda-feira: liberamos seus acessos, crachá e pin e montamos o seu plano de 90 dias. Conto com você!"
  },
  {
    id: "checkin",
    grupo: "Acompanhamento",
    titulo: "Check-in semanal (corretor acolhido)",
    texto:
      "Oi, {nome}! Check-in da semana: como estão as suas atividades? Teve captação, visita ou alguma dúvida em que eu possa ajudar? Me conta por aqui rapidinho."
  },
  {
    id: "nova_turma",
    grupo: "Reativação",
    titulo: "Reativar (inativo ou ex-corretor)",
    texto:
      "Oi, {nome}, tudo bem? Aqui é {remetente}, da RE/MAX Engimob. Estamos organizando as próximas turmas de treinamento e lembrei de você. Se hoje faz sentido retomar a conversa sobre a carreira de corretor, me avisa que a gente marca um papo rápido. Sem compromisso! 🙂"
  },
  {
    id: "livre",
    grupo: "Outros",
    titulo: "Mensagem livre",
    texto: "Oi, {nome}! Aqui é {remetente}, da RE/MAX Engimob. "
  }
];

export const MODELO_POR_ID = new Map(MODELOS_MENSAGEM.map((m) => [m.id, m]));

export type ContextoMensagem = Partial<
  Record<
    | "nome"
    | "remetente"
    | "data_reuniao1"
    | "data_reuniao2"
    | "turma"
    | "inicio_turma"
    | "passos_inicio"
    | "passos_fim"
    | "especificos_a"
    | "especificos_b"
    | "acolhida",
    string | null
  >
>;

// Troca {chave} pelo valor; sem valor, deixa [chave] pra completar na mão.
export function preencherMensagem(texto: string, ctx: ContextoMensagem): string {
  return texto.replace(/\{(\w+)\}/g, (_, chave: string) => {
    const v = (ctx as Record<string, string | null | undefined>)[chave];
    return v && v.trim() ? v : `[${chave.replace(/_/g, " ")}]`;
  });
}

export function primeiroNome(nome: string): string {
  const p = nome.trim().split(/\s+/)[0] ?? "";
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : "";
}

// "dia 05/11" a partir de yyyy-mm-dd (ou null).
export function diaMensagem(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [, m, d] = iso.split("-");
  return `no dia ${d}/${m}`;
}

export function dataCurta(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

// Número no formato do link do WhatsApp (código do país + DDD + número).
export function numeroWhatsapp(digitos: string | null | undefined): string | null {
  const d = (digitos ?? "").replace(/\D/g, "");
  if (!d) return null;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return null;
}

// Modelo sugerido conforme a etapa e a situação da pessoa.
export function modeloSugerido(params: {
  coluna: ColunaId;
  faltou: boolean;
  statusReuniao1: string | null;
  statusReuniao2: string | null;
  // Primeiro passo de follow-up ainda não feito (d1, d3, d7, d15, d30), se houver.
  followupPendente: string | null;
}): string {
  const { coluna, faltou, statusReuniao1, statusReuniao2, followupPendente } = params;
  if (coluna === "sem_interesse" || coluna === "saida") return "nova_turma";
  if (coluna === "estagiario" || coluna === "corretor") return "checkin";
  if (coluna === "Em treinamento") return "turma_confirmar";
  if (coluna === "Decisão e documentação") return "documentacao";
  if (faltou) return "faltou";
  if (coluna === "Lead") return "primeiro_contato";
  if (coluna === "Em contato") return statusReuniao1 === "Agendada" || statusReuniao1 === "Confirmada" ? "confirmar_reuniao1" : "retomar_contato";
  if (coluna === "1ª reunião") {
    if (statusReuniao1 === "Realizada" && followupPendente) return `followup_${followupPendente}`;
    return "confirmar_reuniao1";
  }
  if (coluna === "2ª reunião") {
    if (statusReuniao2 === "Realizada" && followupPendente) return `followup_${followupPendente}`;
    return "confirmar_reuniao2";
  }
  return "livre";
}
