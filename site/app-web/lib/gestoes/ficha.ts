// Ficha de Captação de Imóvel (imóveis sem gestão/exclusividade) — 12/11/2026. Arquivo puro: o formulário do
// portal e o gerador do .docx usam as mesmas listas, então o que o corretor marca é exatamente o que sai na
// ficha. As opções vêm do modelo de ficha da imobiliária (Apartamento garden.docx).

export type EscolhaFicha = { id: string; rotulo: string; opcoes: string[]; multipla?: boolean };

// Perguntas de escolha curta (aparecem na ficha como "( ) Alto ( ) Médio ...").
export const ESCOLHAS_FICHA: EscolhaFicha[] = [
  { id: "padrao", rotulo: "Padrão", opcoes: ["Alto", "Médio", "Baixo", "Regular"] },
  { id: "localizacao", rotulo: "Localização", opcoes: ["Privilegiada", "Ótima", "Média", "Regular"] },
  { id: "financiado", rotulo: "Financiado?", opcoes: ["Sim", "Não"] },
  { id: "situacao", rotulo: "Situação do imóvel", opcoes: ["Desocupado", "Ocupado", "Construção", "Lançamento", "Reservado"] },
  { id: "pelo", rotulo: "Ocupado pelo", opcoes: ["Proprietário", "Inquilino"] },
  { id: "autorizadoNegociacao", rotulo: "Autorizado p/ negociação?", opcoes: ["Sim", "Não"] },
  { id: "exclusividade", rotulo: "Exclusividade", opcoes: ["Sim", "Não"] },
  { id: "usouFgts", rotulo: "Usou FGTS nos últimos 3 anos?", opcoes: ["Sim", "Não"] },
  { id: "face", rotulo: "Face", opcoes: ["L", "O", "N", "S"], multipla: true },
  { id: "placa", rotulo: "Placa no local", opcoes: ["Sim", "Não"] }
];

// Item 3 do formulário: características marcadas em várias opções ("multi-escolha").
export const GRUPOS_FICHA: { id: string; titulo: string; opcoes: string[] }[] = [
  {
    id: "piso",
    titulo: "Piso",
    opcoes: [
      "Aquecido", "Ardósia", "Bloquete", "Carpete", "Carpete de acrílico", "Carpete de madeira", "Carpete de nylon", "Cerâmica",
      "Cimento queimado", "Contrapiso", "Emborrachado", "Granito", "Laminado", "Mármore", "Porcelanato", "Tábua", "Taco de madeira", "Vinílico"
    ]
  },
  {
    id: "armarios",
    titulo: "Armários",
    opcoes: ["Área de serviço", "Banheiro", "Closet", "Corredor", "Cozinha", "Dormitórios", "Dorm. Empregada", "Escritório", "Home theater/cinema", "Sala"]
  },
  { id: "intima", titulo: "Íntima", opcoes: ["Dormitórios", "Suítes", "Nº de banheiros", "Hidromassagem", "Lavabo", "Dormitório reversível"] },
  { id: "social", titulo: "Social", opcoes: ["Aceita Pet", "Escritório", "Nº de salas", "Sacada", "Varanda"] },
  {
    id: "lazer",
    titulo: "Lazer",
    opcoes: [
      "Adega", "Campo de futebol", "Churrasqueira", "Ofurô", "Piscina", "Playground", "Quadra de Tênis", "Quadra Poliesportiva",
      "Quintal", "Sauna", "Solarium", "Varanda gourmet", "Vestiário"
    ]
  },
  { id: "servicos", titulo: "Serviços", opcoes: ["Área de serviço", "Ban. de empregada", "Copa", "Cozinha", "Despensa", "Dorm. Empregada", "Lavanderia", "Zelador"] },
  {
    id: "infra",
    titulo: "Infraestrutura",
    opcoes: [
      "Alarme", "Altura do pé direito", "Ar condicionado", "Aquecimento de água à gás", "Aquecimento de água c/ energia solar", "Área do mezanino",
      "Depósito", "Elevador", "Gerador", "Imóvel no litoral", "Em costeira/Pé na areia", "Vista para o mar", "Beira Mar", "Metros da praia",
      "Imóvel sem condomínio", "Interfone", "Internet", "Jardim de inverno", "Lareira", "Mezanino", "Mobiliado", "Nº de andares", "Nº do andar",
      "Pé direito duplo", "Portão eletrônico", "Semi-Mobiliado", "Terraço", "TV a cabo", "Vagas cobertas", "Vagas descobertas"
    ]
  }
];

export type CampoTexto = { id: string; rotulo: string; tipo: "texto" | "moeda" | "data" | "numero" | "area" };

// Campos preenchidos à mão (o resto — nome, e-mail, telefone, endereço, matrícula — vem do cadastro do cliente e do imóvel).
export const CAMPOS_FICHA: CampoTexto[] = [
  { id: "valorLocacao", rotulo: "Valor de locação (R$)", tipo: "moeda" },
  { id: "finalidade", rotulo: "Finalidade", tipo: "texto" },
  { id: "nomeEdificio", rotulo: "Nome do edifício", tipo: "texto" },
  { id: "nomeCondominio", rotulo: "Nome do condomínio", tipo: "texto" },
  { id: "valorCondominio", rotulo: "Condomínio (R$)", tipo: "moeda" },
  { id: "ocupadoAte", rotulo: "Ocupado até", tipo: "data" },
  { id: "inicioContrato", rotulo: "Início do contrato", tipo: "data" },
  { id: "validadeDias", rotulo: "Validade (dias)", tipo: "numero" },
  { id: "areaTotal", rotulo: "Área total (m²)", tipo: "area" },
  { id: "areaUtil", rotulo: "Área útil (m²)", tipo: "area" },
  { id: "areaExterna", rotulo: "Área externa (m²)", tipo: "area" },
  { id: "valorIptu", rotulo: "IPTU (R$)", tipo: "moeda" },
  { id: "localChave", rotulo: "Local da chave", tipo: "texto" },
  { id: "anoConstrucao", rotulo: "Ano da construção", tipo: "numero" },
  { id: "anoReforma", rotulo: "Ano da reforma", tipo: "numero" },
  { id: "condicaoComercial", rotulo: "Condição comercial", tipo: "texto" },
  { id: "eletricidade", rotulo: "Eletricidade", tipo: "texto" },
  { id: "agua", rotulo: "Água", tipo: "texto" }
];

export type FichaDados = {
  // escolhas curtas: id -> opções marcadas (uma só, ou várias no caso da face)
  escolhas: Record<string, string[]>;
  // grupos multi-escolha: id -> opções marcadas
  grupos: Record<string, string[]>;
  // campos digitados: id -> texto
  campos: Record<string, string>;
  caracteristicasObs: string;
  descricaoAnuncios: string;
  comentarioInterno: string;
};

export function fichaVazia(): FichaDados {
  return {
    escolhas: { exclusividade: ["Não"] },
    grupos: {},
    campos: {},
    caracteristicasObs: "",
    descricaoAnuncios: "",
    comentarioInterno: ""
  };
}

// Lê o JSON guardado (ou vindo do formulário) e devolve só o que é válido: ids e opções conhecidos.
export function fichaDoJson(bruto: unknown): FichaDados {
  const base = fichaVazia();
  if (!bruto || typeof bruto !== "object") return base;
  const j = bruto as Partial<Record<keyof FichaDados, unknown>>;
  const texto = (v: unknown, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");

  const escolhas: Record<string, string[]> = {};
  if (j.escolhas && typeof j.escolhas === "object") {
    for (const e of ESCOLHAS_FICHA) {
      const v = (j.escolhas as Record<string, unknown>)[e.id];
      if (Array.isArray(v)) {
        const validos = v.filter((x): x is string => typeof x === "string" && e.opcoes.includes(x));
        if (validos.length > 0) escolhas[e.id] = e.multipla ? validos : validos.slice(0, 1);
      }
    }
  }
  const grupos: Record<string, string[]> = {};
  if (j.grupos && typeof j.grupos === "object") {
    for (const g of GRUPOS_FICHA) {
      const v = (j.grupos as Record<string, unknown>)[g.id];
      if (Array.isArray(v)) {
        const validos = v.filter((x): x is string => typeof x === "string" && g.opcoes.includes(x));
        if (validos.length > 0) grupos[g.id] = validos;
      }
    }
  }
  const campos: Record<string, string> = {};
  if (j.campos && typeof j.campos === "object") {
    for (const c of CAMPOS_FICHA) {
      const t = texto((j.campos as Record<string, unknown>)[c.id], 200);
      if (t) campos[c.id] = t;
    }
  }
  return {
    escolhas: Object.keys(escolhas).length > 0 ? escolhas : base.escolhas,
    grupos,
    campos,
    caracteristicasObs: texto(j.caracteristicasObs, 1000),
    descricaoAnuncios: texto(j.descricaoAnuncios),
    comentarioInterno: texto(j.comentarioInterno)
  };
}

// "(X) Alto  (  ) Médio  (  ) Baixo ..." — como a ficha impressa mostra cada lista, com as opções marcadas.
export function marcarOpcoes(opcoes: string[], marcadas: string[] | undefined): string {
  const sel = new Set(marcadas ?? []);
  return opcoes.map((o) => `(${sel.has(o) ? "X" : "  "}) ${o}`).join("   ");
}
