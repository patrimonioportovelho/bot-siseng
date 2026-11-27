// ROTEIRO DE ATENDIMENTO — o conteúdo (perguntas, falas sugeridas, opções e para onde cada resposta leva).
// É só DADOS: para mudar um texto, uma opção ou um caminho, edite aqui; a lógica fica em roteiro-motor.ts e a tela
// em components/cliente-roteiro.tsx.
//
// "proximo" pode ser o id de uma pergunta ou um destes atalhos:
//   SEG       primeira pergunta do segmento do cliente
//   APOS_REL  para onde seguir depois da etapa Relacionamento (definido pelo caminho)
//   APOS_IND  para onde seguir depois do pedido de indicação
//   IND_OK    pedido de indicação, se for apropriado (não quando o cliente ficou irritado)
//   DESFECHO  desfecho (já preenchido quando o caminho definiu um; senão pergunta como terminou)
//   FIM       resumo final

export type Segmento = "lead" | "comprador" | "proprietario" | "inquilino" | "locador" | "outros";

export const SEGMENTOS: { id: Segmento; rotulo: string; inicio: string }[] = [
  { id: "lead", rotulo: "Lead / Interessado", inicio: "M_LEAD" },
  { id: "comprador", rotulo: "Comprador (pós-venda)", inicio: "M_COMP" },
  { id: "proprietario", rotulo: "Proprietário (captação)", inicio: "M_PROP" },
  { id: "inquilino", rotulo: "Inquilino", inicio: "M_INQ" },
  { id: "locador", rotulo: "Proprietário locador (administração)", inicio: "M_LOC" },
  { id: "outros", rotulo: "Outros", inicio: "M_OUTROS" }
];

export type Etapa = "contato" | "abertura" | "momento" | "qualificacao" | "relacionamento" | "objecoes" | "desfecho";

export const ETAPAS: { id: Etapa; rotulo: string }[] = [
  { id: "contato", rotulo: "Contato" },
  { id: "abertura", rotulo: "Abertura" },
  { id: "momento", rotulo: "Momento" },
  { id: "qualificacao", rotulo: "Qualificação" },
  { id: "relacionamento", rotulo: "Relacionamento" },
  { id: "objecoes", rotulo: "Objeções" },
  { id: "desfecho", rotulo: "Desfecho" }
];

export type Desfecho = "quer" | "futuro" | "nao_quer" | "sem_contato" | "tentativa" | "contato_invalido";

export const DESFECHOS: Record<Desfecho, { rotulo: string; cor: string }> = {
  quer: { rotulo: "QUER", cor: "bg-green-50 text-green-700 border-green-300" },
  futuro: { rotulo: "FUTURO", cor: "bg-amber-50 text-amber-700 border-amber-300" },
  nao_quer: { rotulo: "NÃO QUER", cor: "bg-red-50 text-red-700 border-red-300" },
  sem_contato: { rotulo: "SEM CONTATO", cor: "bg-gray-100 text-gray-700 border-gray-300" },
  tentativa: { rotulo: "Sem resposta (tentar de novo)", cor: "bg-gray-100 text-gray-700 border-gray-300" },
  contato_invalido: { rotulo: "Contato inválido", cor: "bg-gray-100 text-gray-700 border-gray-300" }
};

export type Acao =
  | { t: "temp"; v: "quente" | "morno" | "frio" }
  | { t: "desfecho"; v: Desfecho; dias?: number }
  | { t: "apos_rel"; ir: string }
  | { t: "apos_ind"; ir: string }
  | { t: "adm"; assunto: string }
  | { t: "tel_invalido" }
  | { t: "modelo"; id: string }
  | { t: "segmento"; v: Segmento }
  | { t: "tag"; v: string };

export type Opcao = { id: string; rotulo: string; proximo?: string; acoes?: Acao[]; obsObrigatoria?: boolean; resposta?: string };

export type Pergunta = {
  id: string;
  etapa: Etapa;
  texto: string;
  // rótulo curto no resumo
  resumo: string;
  // o que a pessoa pode dizer ao cliente ([Nome], [Assistente], [Imobiliária], [imóvel])
  fala?: string;
  // orientação para quem atende (não é para ler ao cliente)
  dica?: string;
  tipo: "unica" | "multipla" | "texto" | "data" | "gancho" | "indicacao";
  opcoes?: Opcao[];
  proximo?: string;
  opcional?: boolean;
  atalhosDias?: number[];
  comHora?: boolean;
};

const FAIXAS_DE_VALOR = ["Até R$ 200 mil", "R$ 200 a 350 mil", "R$ 350 a 500 mil", "R$ 500 a 800 mil", "Acima de R$ 800 mil", "Ainda não sabe"];

const op = (rotulos: string[]): Opcao[] => rotulos.map((r) => ({ id: r, rotulo: r }));

// perguntas da qualificação que o "Ajustar" permite refazer
const AJUSTES = [
  ["Q1", "Objetivo"],
  ["Q2", "Tipo de imóvel"],
  ["Q3", "Região"],
  ["Q4", "Valor"],
  ["Q5", "Pagamento"],
  ["Q6", "Prazo"]
] as const;

export const PERGUNTAS: Pergunta[] = [
  // ---------------- 1. Tentativa de contato ----------------
  {
    id: "C1",
    etapa: "contato",
    texto: "Qual foi o resultado da tentativa?",
    resumo: "Tentativa",
    tipo: "unica",
    opcoes: [
      { id: "atendeu", rotulo: "Atendeu", proximo: "A1" },
      { id: "nao_atendeu", rotulo: "Não atendeu", proximo: "FIM", acoes: [{ t: "desfecho", v: "tentativa" }, { t: "modelo", id: "roteiro_sem_resposta" }] },
      { id: "retornar", rotulo: "Pediu para retornar depois", proximo: "C2", acoes: [{ t: "desfecho", v: "futuro", dias: 2 }] },
      { id: "numero_errado", rotulo: "Número errado / não é a pessoa", proximo: "FIM", acoes: [{ t: "desfecho", v: "contato_invalido" }, { t: "tel_invalido" }] },
      { id: "whatsapp", rotulo: "Respondeu só pelo WhatsApp", proximo: "A1" }
    ]
  },
  { id: "C2", etapa: "contato", texto: "Quando retornar?", resumo: "Retornar em", tipo: "data", comHora: true, atalhosDias: [1, 2, 7], proximo: "FIM" },

  // ---------------- 2. Abertura e conexão ----------------
  {
    id: "A1",
    etapa: "abertura",
    texto: "Lembrou da gente?",
    resumo: "Lembrou da imobiliária",
    fala: "Oi, [Nome]! Aqui é [Assistente], da [Imobiliária]. Você esteve com a gente há um tempo, lembra? Estamos atualizando o cadastro para te mandar só o que faz sentido para você. Tem 2 minutinhos?",
    tipo: "unica",
    opcoes: op(["Sim", "Vagamente", "Não"]),
    proximo: "A2"
  },
  {
    id: "A2",
    etapa: "abertura",
    texto: "Como o cliente recebeu a ligação?",
    resumo: "Recepção",
    dica: "Se a pessoa não lembrou, conte de onde vem o contato (visita, cadastro, imóvel ou contrato) antes de seguir.",
    tipo: "unica",
    opcoes: [
      { id: "receptivo", rotulo: "Receptivo", proximo: "SEG" },
      { id: "neutro", rotulo: "Neutro", proximo: "SEG" },
      { id: "apressado", rotulo: "Apressado (oferecer retorno)", proximo: "C2", acoes: [{ t: "desfecho", v: "futuro", dias: 2 }] },
      { id: "irritado", rotulo: "Irritado", proximo: "D_NQ_MOTIVO", acoes: [{ t: "desfecho", v: "nao_quer" }, { t: "tag", v: "irritado" }] }
    ]
  },

  // ---------------- 3. Momento — Lead ----------------
  {
    id: "M_LEAD",
    etapa: "momento",
    texto: "Qual é o momento do cliente?",
    resumo: "Momento",
    fala: "Você ainda está procurando imóvel ou já resolveu?",
    tipo: "unica",
    opcoes: [
      { id: "ativo", rotulo: "Procurando, ativo", proximo: "Q1", acoes: [{ t: "temp", v: "quente" }] },
      { id: "sem_pressa", rotulo: "Procurando, sem pressa", proximo: "Q1", acoes: [{ t: "temp", v: "morno" }] },
      { id: "outra", rotulo: "Já comprou/alugou com outra imobiliária", proximo: "M_LEAD_PQ", acoes: [{ t: "apos_rel", ir: "IND" }, { t: "apos_ind", ir: "D_NQ_NOV" }, { t: "desfecho", v: "nao_quer" }] },
      { id: "desistiu", rotulo: "Desistiu por enquanto", proximo: "M_LEAD_MOTIVO", acoes: [{ t: "temp", v: "frio" }, { t: "desfecho", v: "futuro", dias: 90 }] }
    ]
  },
  { id: "M_LEAD_PQ", etapa: "momento", texto: "Por que escolheu outra imobiliária?", resumo: "Escolheu outra por", tipo: "unica", opcoes: op(["Preço", "Imóvel melhor", "Atendimento", "Localização", "Outro"]), proximo: "R1" },
  { id: "M_LEAD_MOTIVO", etapa: "momento", texto: "Por que desistiu por enquanto?", resumo: "Desistiu por", tipo: "unica", opcoes: op(["Financeiro", "Mudança de planos", "Esperando os juros caírem", "Outro"]), proximo: "R1" },

  // ---------------- 3. Momento — Comprador ----------------
  {
    id: "M_COMP",
    etapa: "momento",
    texto: "Como está o pós-venda?",
    resumo: "Pós-venda",
    fala: "E aí, como está a casa nova? Ficou tudo certo com a documentação?",
    tipo: "unica",
    opcoes: [
      { id: "satisfeito", rotulo: "Tudo certo, satisfeito", proximo: "R1", acoes: [{ t: "apos_rel", ir: "IND" }, { t: "apos_ind", ir: "M_COMP_INVEST" }] },
      { id: "pendencia", rotulo: "Tem pendência de documentação", proximo: "M_COMP_DOC", acoes: [{ t: "temp", v: "quente" }, { t: "adm", assunto: "Pendência de documentação (despachante)" }, { t: "desfecho", v: "quer" }] },
      { id: "insatisfeito", rotulo: "Insatisfeito com algo", proximo: "R1", obsObrigatoria: true, acoes: [{ t: "adm", assunto: "Comprador insatisfeito" }] }
    ]
  },
  { id: "M_COMP_DOC", etapa: "momento", texto: "Qual é a pendência?", resumo: "Pendência", dica: "Escritura, registro, ITBI, averbação, regularização…", tipo: "texto", proximo: "R1" },
  {
    id: "M_COMP_INVEST",
    etapa: "momento",
    texto: "Pensa em investir ou comprar outro imóvel?",
    resumo: "Novo negócio",
    tipo: "unica",
    opcoes: [
      { id: "sim", rotulo: "Sim", proximo: "Q1" },
      { id: "nao", rotulo: "Não por agora", proximo: "DESFECHO", acoes: [{ t: "desfecho", v: "futuro", dias: 180 }] }
    ]
  },

  // ---------------- 3. Momento — Proprietário (captação) ----------------
  {
    id: "M_PROP",
    etapa: "momento",
    texto: "Qual é a situação do imóvel?",
    resumo: "Imóvel",
    fala: "Seu imóvel [imóvel] ainda está disponível? Você pensa em vender ou alugar?",
    tipo: "unica",
    opcoes: [
      { id: "vender", rotulo: "Quer vender", proximo: "CAP1", acoes: [{ t: "temp", v: "quente" }, { t: "desfecho", v: "quer" }, { t: "tag", v: "avaliacao" }] },
      { id: "alugar", rotulo: "Quer alugar / colocar para administrar", proximo: "CAP1", acoes: [{ t: "temp", v: "quente" }, { t: "desfecho", v: "quer" }, { t: "tag", v: "visita" }] },
      { id: "ja", rotulo: "Já vendeu / alugou", proximo: "R1", acoes: [{ t: "apos_rel", ir: "M_PROP_OUTRO" }] },
      { id: "nao_agora", rotulo: "Não pensa em negociar agora", proximo: "R1", acoes: [{ t: "desfecho", v: "futuro", dias: 120 }] }
    ]
  },
  {
    id: "M_PROP_OUTRO",
    etapa: "momento",
    texto: "Tem outro imóvel?",
    resumo: "Outro imóvel",
    tipo: "unica",
    opcoes: [
      { id: "sim", rotulo: "Sim", proximo: "CAP1", acoes: [{ t: "temp", v: "quente" }, { t: "desfecho", v: "quer" }, { t: "tag", v: "avaliacao" }] },
      { id: "nao", rotulo: "Não", proximo: "DESFECHO" }
    ]
  },

  // ---------------- 3. Momento — Inquilino ----------------
  {
    id: "M_INQ",
    etapa: "momento",
    texto: "Qual é o momento do inquilino?",
    resumo: "Momento",
    fala: "Já pensou em sair do aluguel? Hoje dá para comprar com uma parcela parecida com o aluguel.",
    tipo: "unica",
    opcoes: [
      { id: "comprar", rotulo: "Tem interesse em comprar", proximo: "Q1", acoes: [{ t: "temp", v: "quente" }, { t: "desfecho", v: "quer" }, { t: "tag", v: "simulacao" }] },
      { id: "talvez", rotulo: "Talvez, quer entender melhor", proximo: "R1", acoes: [{ t: "temp", v: "morno" }, { t: "modelo", id: "roteiro_sair_aluguel" }, { t: "desfecho", v: "futuro", dias: 15 }] },
      { id: "bem", rotulo: "Não, está bem no aluguel", proximo: "M_INQ_OK" },
      { id: "sair", rotulo: "Vai sair do imóvel", proximo: "M_INQ_SAIR", acoes: [{ t: "temp", v: "morno" }, { t: "adm", assunto: "Inquilino vai sair do imóvel" }] }
    ]
  },
  {
    id: "M_INQ_OK",
    etapa: "momento",
    texto: "Tudo certo com o imóvel e o contrato?",
    resumo: "Imóvel e contrato",
    tipo: "unica",
    opcoes: [
      { id: "sim", rotulo: "Sim, tudo certo", proximo: "R1" },
      { id: "nao", rotulo: "Tem algum problema", proximo: "R1", obsObrigatoria: true, acoes: [{ t: "adm", assunto: "Inquilino relatou problema" }] }
    ]
  },
  { id: "M_INQ_SAIR", etapa: "momento", texto: "Por que vai sair e quando?", resumo: "Saída", dica: "Anote o motivo e a data prevista. Ofereça ajuda para a próxima locação ou compra.", tipo: "texto", proximo: "R1" },

  // ---------------- 3. Momento — Locador ----------------
  {
    id: "M_LOC",
    etapa: "momento",
    texto: "Como está a administração?",
    resumo: "Administração",
    fala: "Está satisfeito com a administração do seu imóvel? Tem mais algum imóvel que a gente possa cuidar?",
    tipo: "unica",
    opcoes: [
      { id: "outro", rotulo: "Satisfeito e tem outro imóvel", proximo: "CAP1", acoes: [{ t: "temp", v: "quente" }, { t: "desfecho", v: "quer" }, { t: "tag", v: "visita" }] },
      { id: "sem_outro", rotulo: "Satisfeito, sem outros imóveis", proximo: "R1", acoes: [{ t: "apos_rel", ir: "IND" }, { t: "desfecho", v: "futuro", dias: 180 }] },
      { id: "reclamacao", rotulo: "Tem reclamação", proximo: "R1", obsObrigatoria: true, acoes: [{ t: "adm", assunto: "Reclamação de proprietário (administração)" }] }
    ]
  },

  // ---------------- 3. Momento — Outros ----------------
  {
    id: "M_OUTROS",
    etapa: "momento",
    texto: "Qual é o interesse hoje?",
    resumo: "Interesse",
    tipo: "unica",
    opcoes: [
      { id: "comprar", rotulo: "Comprar", proximo: "Q1", acoes: [{ t: "segmento", v: "lead" }] },
      { id: "alugar", rotulo: "Alugar", proximo: "Q1", acoes: [{ t: "segmento", v: "lead" }] },
      { id: "vender", rotulo: "Vender", proximo: "CAP1", acoes: [{ t: "segmento", v: "proprietario" }, { t: "desfecho", v: "quer" }, { t: "tag", v: "avaliacao" }] },
      { id: "administrar", rotulo: "Administrar", proximo: "CAP1", acoes: [{ t: "segmento", v: "locador" }, { t: "desfecho", v: "quer" }, { t: "tag", v: "visita" }] },
      { id: "nenhum", rotulo: "Nenhum", proximo: "R1" }
    ]
  },

  // ---------------- 4. Qualificação (quem quer comprar ou alugar) ----------------
  { id: "Q1", etapa: "qualificacao", texto: "Qual é o objetivo?", resumo: "Objetivo", fala: "Me conta um pouco do que você está buscando.", dica: "Perguntas abertas; ouça mais do que fala.", tipo: "unica", opcoes: op(["Morar", "Investir", "Ambos"]), proximo: "Q2" },
  { id: "Q2", etapa: "qualificacao", texto: "Que tipo de imóvel?", resumo: "Tipo", tipo: "multipla", opcoes: op(["Casa", "Apartamento", "Terreno", "Comercial", "Rural", "Condomínio fechado"]), proximo: "Q3" },
  { id: "Q3", etapa: "qualificacao", texto: "Que região ou bairros interessam?", resumo: "Região", dica: "Separe os bairros por vírgula.", tipo: "texto", opcional: true, proximo: "Q4" },
  { id: "Q4", etapa: "qualificacao", texto: "Qual a faixa de valor?", resumo: "Valor", tipo: "unica", opcoes: op(FAIXAS_DE_VALOR), proximo: "Q5" },
  {
    id: "Q5",
    etapa: "qualificacao",
    texto: "Como pretende pagar?",
    resumo: "Pagamento",
    tipo: "multipla",
    opcoes: op(["À vista", "Financiamento", "Consórcio", "FGTS", "Permuta", "Ainda não sabe"]),
    proximo: "Q6"
  },
  {
    id: "Q6",
    etapa: "qualificacao",
    texto: "Em quanto tempo quer resolver?",
    resumo: "Prazo",
    tipo: "unica",
    opcoes: [
      { id: "imediato", rotulo: "Imediato (até 30 dias)" },
      { id: "1_3", rotulo: "1 a 3 meses" },
      { id: "3_6", rotulo: "3 a 6 meses" },
      { id: "mais_6", rotulo: "Mais de 6 meses" }
    ],
    proximo: "Q7"
  },
  { id: "Q7", etapa: "qualificacao", texto: "O que é inegociável?", resumo: "Inegociável", tipo: "multipla", opcoes: op(["Número de quartos", "Garagem", "Perto de escola ou trabalho", "Segurança", "Quintal", "Aceita pet", "Nada específico"]), opcional: true, proximo: "Q8" },
  { id: "Q8", etapa: "qualificacao", texto: "Por que agora?", resumo: "Motivo", tipo: "unica", opcoes: op(["Casamento", "Filhos", "Sair do aluguel", "Trabalho", "Investimento", "Mais espaço", "Outro"]), proximo: "Q9" },
  { id: "Q9", etapa: "qualificacao", texto: "Quem decide junto?", resumo: "Decide com", tipo: "unica", opcoes: op(["Sozinho", "Cônjuge", "Família", "Sócio"]), proximo: "Q_CONF" },
  {
    id: "Q_CONF",
    etapa: "qualificacao",
    texto: "O cliente confirmou o resumo?",
    resumo: "Confirmação",
    // a fala é montada pelo motor com as respostas (ver falaDeDevolucao)
    fala: "[devolucao]",
    tipo: "unica",
    opcoes: [
      { id: "confirmou", rotulo: "Confirmou", proximo: "R1" },
      ...AJUSTES.map(([id, nome]) => ({ id: `ajustar_${id}`, rotulo: `Ajustar: ${nome}`, proximo: id }))
    ]
  },

  // ---------------- 4b. Captação (quem quer vender ou colocar para alugar) ----------------
  { id: "CAP1", etapa: "qualificacao", texto: "Qual o valor pretendido?", resumo: "Valor pretendido", fala: "Você tem uma ideia de valor?", tipo: "texto", opcional: true, proximo: "CAP2" },
  { id: "CAP2", etapa: "qualificacao", texto: "A documentação do imóvel está em ordem?", resumo: "Documentação", tipo: "unica", opcoes: op(["Sim", "Não", "Não sabe"]), proximo: "CAP3" },
  { id: "CAP3", etapa: "qualificacao", texto: "Aceita exclusividade?", resumo: "Exclusividade", tipo: "unica", opcoes: op(["Sim", "Talvez", "Não"]), proximo: "R1" },

  // ---------------- 5. Relacionamento ----------------
  {
    id: "R1",
    etapa: "relacionamento",
    texto: "O que você descobriu nesta conversa?",
    resumo: "Descobriu",
    dica: "Converse naturalmente, sem cara de questionário. Marque só o que o cliente comentou. Não registre dados sensíveis (saúde, religião, política, orientação sexual, finanças delicadas).",
    tipo: "multipla",
    opcoes: op(["Família", "Trabalho", "Time", "Hobbies", "Carro", "Viagem", "Data importante", "Preferência de contato", "Nada novo"]),
    proximo: "R2"
  },
  { id: "R2", etapa: "relacionamento", texto: "Gancho para a próxima conversa", resumo: "Gancho", dica: "Algo curto que dê assunto depois. Ex.: “Vai para Portugal em março”. Se quiser, marque quando lembrar.", tipo: "gancho", proximo: "APOS_REL" },

  // ---------------- 6. Objeções ----------------
  {
    id: "O0",
    etapa: "objecoes",
    texto: "O cliente hesitou ou apresentou objeção?",
    resumo: "Hesitou",
    tipo: "unica",
    opcoes: [
      { id: "nao", rotulo: "Não", proximo: "DESFECHO" },
      { id: "sim", rotulo: "Sim", proximo: "O1" }
    ]
  },
  {
    id: "O1",
    etapa: "objecoes",
    texto: "Qual a objeção principal?",
    resumo: "Objeção",
    tipo: "unica",
    opcoes: [
      { id: "caro", rotulo: "Está caro / sem dinheiro agora", proximo: "O2", resposta: "Entendo. Posso te mostrar uma simulação? Às vezes a parcela fica mais perto do que você imagina." },
      { id: "pensar", rotulo: "Vou pensar", proximo: "O2", resposta: "Claro! O que ainda te deixa em dúvida? Assim já te mando o que ajuda a decidir." },
      { id: "outro_corretor", rotulo: "Já estou vendo com outro corretor", proximo: "O2", resposta: "Sem problema! Se quiser uma segunda opção, sigo te mandando só o que encaixar no seu perfil, combinado?" },
      { id: "momento", rotulo: "Não é o momento", proximo: "D_FUT_QUANDO", acoes: [{ t: "desfecho", v: "futuro", dias: 60 }], resposta: "Faz sentido. Quando você acha que seria um bom momento para eu te procurar?" },
      { id: "juros", rotulo: "Juros altos / esperando cair", proximo: "D_FUT_QUANDO", acoes: [{ t: "desfecho", v: "futuro", dias: 90 }, { t: "tag", v: "aguardando juros" }], resposta: "Te aviso assim que houver mudança nas taxas, combinado?" },
      { id: "outra", rotulo: "Outra (anote)", proximo: "O2", obsObrigatoria: true }
    ]
  },
  {
    id: "O2",
    etapa: "objecoes",
    texto: "Depois da conversa, a objeção…",
    resumo: "Objeção depois",
    tipo: "unica",
    opcoes: [
      { id: "contornada", rotulo: "Foi contornada", proximo: "DESFECHO" },
      { id: "continua", rotulo: "Continua", proximo: "D0" }
    ]
  },

  // ---------------- 7. Desfecho ----------------
  {
    id: "D0",
    etapa: "desfecho",
    texto: "Como terminou a conversa?",
    resumo: "Terminou em",
    tipo: "unica",
    opcoes: [
      { id: "quer", rotulo: "QUER (seguir agora)", proximo: "D_QUER", acoes: [{ t: "desfecho", v: "quer" }] },
      { id: "futuro", rotulo: "FUTURO (retornar depois)", proximo: "D_FUT_QUANDO", acoes: [{ t: "desfecho", v: "futuro" }] },
      { id: "nao_quer", rotulo: "NÃO QUER", proximo: "D_NQ_MOTIVO", acoes: [{ t: "desfecho", v: "nao_quer" }] }
    ]
  },
  {
    id: "D_QUER",
    etapa: "desfecho",
    texto: "O que fazer agora?",
    resumo: "Próximo passo",
    tipo: "unica",
    opcoes: [
      { id: "encaminhar", rotulo: "Encaminhar ao corretor" },
      { id: "visita", rotulo: "Agendar visita" },
      { id: "avaliacao", rotulo: "Agendar avaliação do imóvel" },
      { id: "simulacao", rotulo: "Simulação de financiamento", acoes: [{ t: "modelo", id: "roteiro_sair_aluguel" }] },
      { id: "opcoes", rotulo: "Enviar opções por WhatsApp", acoes: [{ t: "modelo", id: "roteiro_envio_opcoes" }] }
    ],
    proximo: "D_QUER_QUANDO"
  },
  { id: "D_QUER_QUANDO", etapa: "desfecho", texto: "Para quando?", resumo: "Quando", tipo: "data", comHora: true, atalhosDias: [0, 1, 2, 7], proximo: "FIM" },
  { id: "D_FUT_QUANDO", etapa: "desfecho", texto: "Quando retornar?", resumo: "Retornar em", tipo: "data", comHora: true, atalhosDias: [15, 30, 60, 90], proximo: "D_FUT_MOTIVO" },
  { id: "D_FUT_MOTIVO", etapa: "desfecho", texto: "Qual o motivo de deixar para depois?", resumo: "Motivo", tipo: "texto", opcional: true, proximo: "FIM" },
  { id: "D_NQ_MOTIVO", etapa: "desfecho", texto: "Por que não quer?", resumo: "Motivo", fala: "Sem problema, não quero te incomodar. Posso só anotar o motivo?", tipo: "unica", opcoes: op(["Já resolveu", "Sem interesse", "Mudou de cidade", "Não gosta de contato", "Outro"]), proximo: "D_NQ_NOV" },
  {
    id: "D_NQ_NOV",
    etapa: "desfecho",
    texto: "Quer continuar recebendo novidades?",
    resumo: "Quer novidades",
    fala: "Você quer continuar recebendo novidades nossas de vez em quando?",
    tipo: "unica",
    opcoes: [
      { id: "sim", rotulo: "Sim (manter na base)", proximo: "IND_OK", acoes: [{ t: "apos_ind", ir: "FIM" }] },
      { id: "nao", rotulo: "Não (opt-out — LGPD)", proximo: "FIM", acoes: [{ t: "tag", v: "optout" }] }
    ]
  },

  // ---------------- Pedido de indicação ----------------
  {
    id: "IND",
    etapa: "relacionamento",
    texto: "Pedido de indicação",
    resumo: "Indicação",
    fala: "Se alguém da sua família ou do trabalho estiver procurando imóvel, a gente cuida com o mesmo carinho.",
    tipo: "indicacao",
    opcoes: [
      { id: "indicou", rotulo: "Indicou alguém" },
      { id: "pensar", rotulo: "Vai pensar" },
      { id: "nao", rotulo: "Não" }
    ],
    proximo: "APOS_IND"
  }
];

export const PERGUNTA_POR_ID = new Map(PERGUNTAS.map((p) => [p.id, p]));
export const PRIMEIRA_PERGUNTA = "C1";
export const VERSAO_ROTEIRO = 1;

// Segmento sugerido pelo que o sistema já sabe do cliente (a pessoa pode trocar antes de começar).
export function segmentoDoCliente(papeis: string[], tiposDeVinculo: string[]): Segmento {
  if (papeis.includes("Inquilino")) return "inquilino";
  if (tiposDeVinculo.includes("Administração")) return "locador";
  if (papeis.includes("Proprietário")) return "proprietario";
  if (papeis.includes("Comprador")) return "comprador";
  return "lead";
}
