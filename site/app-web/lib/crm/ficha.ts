// FICHA DE RELACIONAMENTO — o que o cliente compartilhou e que dá assunto para a próxima conversa. Este arquivo é só a
// definição dos campos (usado no navegador e no servidor).
// De propósito NÃO há campo para saúde, religião, posição política, orientação sexual ou situação financeira delicada.

export const AVISO_LGPD = "Registre apenas o que o cliente compartilhou com você. Não registre dados sensíveis.";

export type Filho = { nome: string; ano: string };
export type FichaDados = Record<string, string | Filho[]>;

export type CampoFicha = {
  id: string;
  grupo: string;
  // opção da pergunta "O que você descobriu nesta conversa?" que abre este campo durante o roteiro
  descoberta: string;
  rotulo: string;
  tipo: "texto" | "escolha" | "tags" | "data" | "filhos";
  opcoes?: string[];
  exemplo?: string;
};

export const CAMPOS_FICHA: CampoFicha[] = [
  { id: "conjuge", grupo: "Família", descoberta: "Família", rotulo: "Nome do cônjuge", tipo: "texto" },
  { id: "filhos", grupo: "Família", descoberta: "Família", rotulo: "Filhos", tipo: "filhos" },
  { id: "pets", grupo: "Família", descoberta: "Família", rotulo: "Pets", tipo: "texto", exemplo: "Ex.: cachorro Thor" },
  { id: "momento_vida", grupo: "Família", descoberta: "Família", rotulo: "Momento de vida", tipo: "escolha", opcoes: ["Casando", "Filho chegando", "Filhos saindo de casa", "Aposentando", "Mudando de cidade", "Outro"] },

  { id: "empresa", grupo: "Profissão", descoberta: "Trabalho", rotulo: "Onde trabalha", tipo: "texto" },
  { id: "cargo", grupo: "Profissão", descoberta: "Trabalho", rotulo: "Cargo / área", tipo: "texto" },
  { id: "empreendedor", grupo: "Profissão", descoberta: "Trabalho", rotulo: "Tem negócio próprio?", tipo: "escolha", opcoes: ["Sim", "Não"] },
  { id: "mudou_emprego", grupo: "Profissão", descoberta: "Trabalho", rotulo: "Mudou de emprego há pouco?", tipo: "escolha", opcoes: ["Sim", "Não"] },

  { id: "time", grupo: "Lazer", descoberta: "Time", rotulo: "Time de futebol", tipo: "texto" },
  { id: "esportes", grupo: "Lazer", descoberta: "Hobbies", rotulo: "Esportes que pratica", tipo: "texto" },
  { id: "hobbies", grupo: "Lazer", descoberta: "Hobbies", rotulo: "Hobbies", tipo: "tags", opcoes: ["Pesca", "Academia", "Churrasco", "Moto", "Viagem", "Futebol", "Leitura"] },

  { id: "carro", grupo: "Estilo", descoberta: "Carro", rotulo: "Carro atual (modelo / ano)", tipo: "texto" },
  { id: "gosta_viajar", grupo: "Estilo", descoberta: "Viagem", rotulo: "Gosta de viajar?", tipo: "escolha", opcoes: ["Sim", "Não"] },
  { id: "destinos", grupo: "Estilo", descoberta: "Viagem", rotulo: "Destinos que foi ou quer ir", tipo: "texto" },

  { id: "nascimento", grupo: "Datas", descoberta: "Data importante", rotulo: "Aniversário", tipo: "data" },
  { id: "casamento", grupo: "Datas", descoberta: "Data importante", rotulo: "Aniversário de casamento", tipo: "data" },
  { id: "casa", grupo: "Datas", descoberta: "Data importante", rotulo: "Compra ou locação do imóvel", tipo: "data" },

  { id: "horario", grupo: "Preferências de contato", descoberta: "Preferência de contato", rotulo: "Melhor horário", tipo: "escolha", opcoes: ["Manhã", "Tarde", "Noite"] },
  { id: "canal", grupo: "Preferências de contato", descoberta: "Preferência de contato", rotulo: "Canal preferido", tipo: "escolha", opcoes: ["Ligação", "WhatsApp (texto)", "WhatsApp (áudio)", "E-mail"] },
  { id: "perfil", grupo: "Preferências de contato", descoberta: "Preferência de contato", rotulo: "Perfil", tipo: "escolha", opcoes: ["Objetivo", "Gosta de conversar"] }
];

export const GRUPOS_FICHA = [...new Set(CAMPOS_FICHA.map((c) => c.grupo))];

const data = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && v >= "1900-01-01" && v <= "2100-12-31" ? v : "");

// Só os campos conhecidos, com tamanho limitado. Valor vazio fica de fora.
export function limparFicha(entrada: unknown): FichaDados {
  const out: FichaDados = {};
  if (!entrada || typeof entrada !== "object") return out;
  const e = entrada as Record<string, unknown>;
  for (const c of CAMPOS_FICHA) {
    const v = e[c.id];
    if (c.tipo === "filhos") {
      if (!Array.isArray(v)) continue;
      const filhos = v
        .slice(0, 15)
        .map((f) => ({ nome: String((f as Filho)?.nome ?? "").trim().slice(0, 80), ano: String((f as Filho)?.ano ?? "").replace(/\D/g, "").slice(0, 4) }))
        .filter((f) => f.nome || f.ano);
      if (filhos.length) out[c.id] = filhos;
      continue;
    }
    if (typeof v !== "string") continue;
    let texto = v.trim().slice(0, 200);
    if (c.tipo === "data") texto = data(texto);
    else if (c.tipo === "escolha" && !c.opcoes?.includes(texto)) texto = "";
    if (texto) out[c.id] = texto;
  }
  return out;
}

export function textoDoCampo(valor: string | Filho[] | undefined, tipo: CampoFicha["tipo"]): string {
  if (!valor) return "";
  if (Array.isArray(valor)) return valor.map((f) => `${f.nome || "filho(a)"}${f.ano ? ` (${f.ano})` : ""}`).join(", ");
  return tipo === "data" ? valor.split("-").reverse().join("/") : valor;
}

// "Time: Flamengo; Carro: Corolla 2020" (para o resumo do atendimento)
export function resumoDaFicha(dados: FichaDados | undefined): string {
  if (!dados) return "";
  return CAMPOS_FICHA.map((c) => {
    const t = textoDoCampo(dados[c.id], c.tipo);
    return t ? `${c.rotulo.replace(/\?$/, "")}: ${t}` : "";
  })
    .filter(Boolean)
    .join("; ");
}

export type Gancho = { id: string; texto: string; lembrarEm: string | null; criadoEm: string; por: string | null };

export type FichaDoCliente = {
  dados: FichaDados;
  ganchos: Gancho[];
  // do cadastro (aqui só para consulta)
  estadoCivil: string | null;
  conjugeCadastro: string | null;
  // quando o cadastro já tem a data de nascimento, ela vale e não é editada pela ficha
  nascimentoCadastro: string | null;
  // data do contrato de compra ou locação que o sistema encontrou
  casaContrato: { data: string; tipo: string } | null;
};

export const FICHA_VAZIA: FichaDoCliente = { dados: {}, ganchos: [], estadoCivil: null, conjugeCadastro: null, nascimentoCadastro: null, casaContrato: null };
