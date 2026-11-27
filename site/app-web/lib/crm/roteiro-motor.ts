import { somarDias } from "@/lib/crm/atividades";
import { DESFECHOS, PERGUNTA_POR_ID, PRIMEIRA_PERGUNTA, SEGMENTOS, type Desfecho, type Pergunta, type Segmento } from "@/lib/crm/roteiro";

// MOTOR do roteiro de atendimento: funções puras (sem banco, sem tela) que, a partir do caminho percorrido e das
// respostas, dizem qual é a próxima pergunta, o desfecho, a temperatura, a próxima atividade sugerida e o resumo.
// Tudo é recalculado a partir das respostas, então "Voltar" e mudar uma resposta nunca deixam sobra. O servidor usa
// as mesmas funções para conferir o atendimento antes de gravar.

export type Resposta = {
  v?: string[]; // opções escolhidas (ids)
  texto?: string;
  data?: string; // yyyy-mm-dd
  hora?: string; // HH:MM
  obs?: string;
  nome?: string; // indicação
  telefone?: string; // indicação
  lembrar?: string; // gancho: lembrar em (yyyy-mm-dd)
};
export type Respostas = Record<string, Resposta>;

export type Temperatura = "quente" | "morno" | "frio" | "nao_quer";

export type Contexto = {
  segmento: Segmento;
  temperaturaAcao: "quente" | "morno" | "frio" | null;
  desfecho: Desfecho | null;
  diasRetorno: number | null;
  aposRel: string | null;
  aposInd: string | null;
  adm: string[]; // assuntos para avisar o administrativo
  telefoneInvalido: boolean;
  modelo: string | null; // modelo de WhatsApp sugerido
  tags: string[];
};

export const MAXIMO_TENTATIVAS = 3;

const opcoesEscolhidas = (p: Pergunta, r: Resposta | undefined) => (p.opcoes ?? []).filter((o) => r?.v?.includes(o.id));

export function contextoDe(segmentoInicial: Segmento, caminho: string[], respostas: Respostas): Contexto {
  const ctx: Contexto = { segmento: segmentoInicial, temperaturaAcao: null, desfecho: null, diasRetorno: null, aposRel: null, aposInd: null, adm: [], telefoneInvalido: false, modelo: null, tags: [] };
  for (const id of caminho) {
    const p = PERGUNTA_POR_ID.get(id);
    if (!p) continue;
    for (const o of opcoesEscolhidas(p, respostas[id])) {
      for (const a of o.acoes ?? []) {
        if (a.t === "temp") ctx.temperaturaAcao = a.v;
        else if (a.t === "desfecho") {
          // escolher o desfecho na mão (sem prazo) não apaga o prazo sugerido pelo caminho
          ctx.desfecho = a.v;
          if (a.dias !== undefined) ctx.diasRetorno = a.dias;
        } else if (a.t === "apos_rel") ctx.aposRel = a.ir;
        else if (a.t === "apos_ind") ctx.aposInd = a.ir;
        else if (a.t === "adm") {
          if (!ctx.adm.includes(a.assunto)) ctx.adm.push(a.assunto);
        } else if (a.t === "tel_invalido") ctx.telefoneInvalido = true;
        else if (a.t === "modelo") ctx.modelo = a.id;
        else if (a.t === "segmento") ctx.segmento = a.v;
        else if (a.t === "tag") {
          if (!ctx.tags.includes(a.v)) ctx.tags.push(a.v);
        }
      }
    }
  }
  return ctx;
}

function resolver(alvo: string, ctx: Contexto, caminho: string[], profundidade = 0): string {
  if (profundidade > 5) return "FIM";
  const de = (x: string) => resolver(x, ctx, caminho, profundidade + 1);
  if (alvo === "SEG") return SEGMENTOS.find((s) => s.id === ctx.segmento)?.inicio ?? "M_OUTROS";
  // Relacionamento é perguntado uma vez só: voltando de uma segunda qualificação (ex.: comprador que quer investir),
  // segue direto para o que vem depois dele.
  if (alvo === "R1" && caminho.includes("R1")) return de("APOS_REL");
  // depois de Relacionamento: o que o caminho definiu (se ainda não passou por lá); quem passou pela qualificação
  // ainda responde sobre objeções
  if (alvo === "APOS_REL") return de(ctx.aposRel && !caminho.includes(ctx.aposRel) ? ctx.aposRel : caminho.some((id) => id === "Q1" || id === "CAP1") ? "O0" : "DESFECHO");
  if (alvo === "IND_OK") return ctx.tags.includes("irritado") || caminho.includes("IND") ? "FIM" : "IND";
  if (alvo === "APOS_IND") return de(ctx.aposInd ?? "DESFECHO");
  if (alvo === "DESFECHO") return ctx.desfecho === "quer" ? "D_QUER" : ctx.desfecho === "futuro" ? "D_FUT_QUANDO" : ctx.desfecho === "nao_quer" ? "D_NQ_MOTIVO" : "D0";
  return alvo;
}

// Próxima pergunta depois da última do caminho (já respondida). "FIM" = ir para o resumo.
export function proximaPergunta(segmento: Segmento, caminho: string[], respostas: Respostas): string {
  const id = caminho[caminho.length - 1];
  const p = PERGUNTA_POR_ID.get(id);
  if (!p) return PRIMEIRA_PERGUNTA;
  const escolhida = p.tipo === "unica" ? opcoesEscolhidas(p, respostas[id])[0] : undefined;
  const alvo = escolhida?.proximo ?? p.proximo ?? "DESFECHO";
  return resolver(alvo, contextoDe(segmento, caminho, respostas), caminho);
}

// Avança o caminho. Voltar a uma pergunta já percorrida ("Ajustar" do resumo) corta o caminho ali: nunca há pergunta
// repetida, e o que vinha depois é respondido de novo (as respostas continuam preenchidas).
export function avancar(caminho: string[], proxima: string): string[] {
  const i = caminho.indexOf(proxima);
  return i >= 0 ? caminho.slice(0, i + 1) : [...caminho, proxima];
}

export function validarResposta(p: Pergunta, r: Resposta | undefined, respostas: Respostas, hoje: string): string | null {
  if (p.tipo === "unica" || p.tipo === "multipla") {
    if (!p.opcional && !r?.v?.length) return "Escolha uma opção.";
    if (r?.v?.some((v) => !(p.opcoes ?? []).some((o) => o.id === v))) return "Opção inválida.";
    if (p.tipo === "unica" && (r?.v?.length ?? 0) > 1) return "Escolha só uma opção.";
    if (opcoesEscolhidas(p, r).some((o) => o.obsObrigatoria) && !r?.obs?.trim()) return "Escreva a observação (é obrigatória nesta resposta).";
    return null;
  }
  if (p.tipo === "texto") return !p.opcional && !r?.texto?.trim() ? "Escreva a resposta." : null;
  if (p.tipo === "data") {
    if (!r?.data || !/^\d{4}-\d{2}-\d{2}$/.test(r.data)) return "Escolha a data.";
    return r.data < hoje ? "A data precisa ser hoje ou uma data futura." : null;
  }
  if (p.tipo === "gancho") {
    const nadaNovo = respostas.R1?.v?.includes("Nada novo");
    if (!nadaNovo && !r?.texto?.trim()) return "Escreva pelo menos um gancho (ou marque “Nada novo” na pergunta anterior).";
    if (r?.lembrar && r.lembrar < hoje) return "A data para lembrar precisa ser futura.";
    return null;
  }
  // indicação
  if (!r?.v?.length) return "Escolha uma opção.";
  if (r.v.includes("indicou")) {
    if (!r.nome?.trim()) return "Informe o nome da pessoa indicada.";
    const d = (r.telefone ?? "").replace(/\D/g, "");
    if (d.length < 10 || d.length > 13) return "Informe o telefone com DDD.";
  }
  return null;
}

// Confere um atendimento inteiro: o caminho segue o roteiro, todas as respostas são válidas e ele chega ao fim.
export function validarAtendimento(segmento: Segmento, caminho: string[], respostas: Respostas, hoje: string): string | null {
  if (caminho[0] !== PRIMEIRA_PERGUNTA || caminho.length > 80 || new Set(caminho).size !== caminho.length) return "Atendimento incompleto. Refaça pelo começo.";
  for (let i = 0; i < caminho.length; i++) {
    const p = PERGUNTA_POR_ID.get(caminho[i]);
    if (!p) return "O roteiro mudou. Descarte este atendimento e comece de novo.";
    const erro = validarResposta(p, respostas[p.id], respostas, hoje);
    if (erro) return `${p.resumo}: ${erro}`;
    const prox = proximaPergunta(segmento, caminho.slice(0, i + 1), respostas);
    if (i + 1 < caminho.length && prox !== caminho[i + 1]) return "O caminho do atendimento não confere. Volte e confira as respostas.";
    if (i + 1 === caminho.length && prox !== "FIM") return "O atendimento ainda não chegou ao desfecho.";
  }
  return null;
}

// Desfecho final. `tentativasAnteriores` = quantas tentativas sem resposta seguidas já existiam antes desta.
export function desfechoFinal(ctx: Contexto, tentativasAnteriores: number): Desfecho {
  if (ctx.desfecho === "tentativa") return tentativasAnteriores + 1 >= MAXIMO_TENTATIVAS ? "sem_contato" : "tentativa";
  return ctx.desfecho ?? "futuro";
}

export const temOptOut = (ctx: Contexto) => ctx.tags.includes("optout");

// Temperatura do cliente. null = este atendimento não muda a temperatura (não houve conversa).
export function temperaturaFinal(ctx: Contexto, desfecho: Desfecho, caminho: string[], respostas: Respostas, hoje: string): Temperatura | null {
  if (temOptOut(ctx)) return "nao_quer";
  if (desfecho === "quer") return "quente";
  if (desfecho === "tentativa" || desfecho === "sem_contato" || desfecho === "contato_invalido") return null;
  if (desfecho === "nao_quer") return "frio";
  // futuro: nunca "quente". Pela qualificação, prazo acima de 6 meses é frio; até 6 meses é morno.
  if (caminho.includes("Q6")) return respostas.Q6?.v?.[0] === "mais_6" ? "frio" : "morno";
  if (ctx.temperaturaAcao === "frio") return "frio";
  const data = respostas.D_FUT_QUANDO?.data;
  if (data && data > somarDias(hoje, 90)) return "frio";
  return "morno";
}

export type ProximaSugerida = { obrigatoria: boolean; tipo: string; titulo: string; data: string; hora: string };

// A próxima atividade que o atendimento pede (a pessoa pode ajustar antes de concluir).
export function sugerirProxima(ctx: Contexto, desfecho: Desfecho, respostas: Respostas, hoje: string, tentativasAnteriores: number, nome: string): ProximaSugerida {
  const s = (tipo: string, titulo: string, data: string, hora = "", obrigatoria = true): ProximaSugerida => ({ obrigatoria, tipo, titulo: `${titulo} — ${nome}`, data, hora });
  if (desfecho === "quer") {
    const acao = respostas.D_QUER?.v?.[0] ?? "encaminhar";
    const [tipo, titulo] =
      acao === "visita"
        ? ["Visita", "Visita"]
        : acao === "avaliacao"
          ? ["Avaliação do imóvel", "Avaliação do imóvel"]
          : acao === "simulacao"
            ? ["Simulação de financiamento", "Simulação de financiamento"]
            : acao === "opcoes"
              ? ["WhatsApp", "Enviar opções de imóveis"]
              : ["Ligar", ctx.adm.length ? ctx.adm[0] : "Ligar para o cliente (lead quente)"];
    return s(tipo, titulo, respostas.D_QUER_QUANDO?.data ?? hoje, respostas.D_QUER_QUANDO?.hora ?? "");
  }
  if (desfecho === "tentativa") {
    const n = tentativasAnteriores + 1;
    return n === 1 ? s("WhatsApp", "2ª tentativa (WhatsApp)", somarDias(hoje, 2)) : s("Ligar", "3ª tentativa (ligar em outro horário)", somarDias(hoje, 2));
  }
  if (desfecho === "sem_contato") return s("Ligar", "Nova rodada de tentativas", somarDias(hoje, 60));
  if (desfecho === "contato_invalido") return s("Outro", "Atualizar o contato (procurar nas redes sociais)", somarDias(hoje, 1));
  if (desfecho === "nao_quer") return s("WhatsApp", "Manutenção: enviar novidades", somarDias(hoje, 180), "", !temOptOut(ctx));
  const r = respostas.D_FUT_QUANDO ?? respostas.C2;
  return s("Ligar", "Retomar contato", r?.data ?? somarDias(hoje, ctx.diasRetorno ?? 30), r?.hora ?? "");
}

// Texto de uma resposta (rótulos das opções, texto, data, observação).
export function textoDaResposta(p: Pergunta, r: Resposta | undefined): string {
  if (!r) return "";
  const partes: string[] = [];
  const rotulos = opcoesEscolhidas(p, r).map((o) => o.rotulo);
  if (rotulos.length) partes.push(rotulos.join(", "));
  if (r.texto?.trim()) partes.push(r.texto.trim());
  if (r.data) partes.push(`${r.data.split("-").reverse().join("/")}${r.hora ? ` às ${r.hora}` : ""}`);
  if (r.v?.includes("indicou") && r.nome) partes.push(`${r.nome.trim()} (${r.telefone?.trim() ?? ""})`);
  if (r.lembrar) partes.push(`lembrar em ${r.lembrar.split("-").reverse().join("/")}`);
  if (r.obs?.trim()) partes.push(`obs.: ${r.obs.trim()}`);
  return partes.join(" · ");
}

export function resumoDoAtendimento(caminho: string[], respostas: Respostas): { id: string; rotulo: string; texto: string }[] {
  const vistos = new Set<string>();
  const out: { id: string; rotulo: string; texto: string }[] = [];
  for (const id of caminho) {
    const p = PERGUNTA_POR_ID.get(id);
    if (!p || vistos.has(id) || id === "Q_CONF") continue;
    vistos.add(id);
    const texto = textoDaResposta(p, respostas[id]);
    if (texto) out.push({ id, rotulo: p.resumo, texto });
  }
  return out;
}

export function textoDoResumo(desfecho: Desfecho, caminho: string[], respostas: Respostas): string {
  return [`Desfecho: ${DESFECHOS[desfecho].rotulo}`, ...resumoDoAtendimento(caminho, respostas).map((l) => `${l.rotulo}: ${l.texto}`)].join("\n");
}

// "Então, se eu entendi bem, você procura…" montada com as respostas da qualificação.
export function falaDeDevolucao(respostas: Respostas): string {
  const lista = (id: string) => {
    const p = PERGUNTA_POR_ID.get(id)!;
    return opcoesEscolhidas(p, respostas[id]).map((o) => o.rotulo.toLowerCase()).join(" ou ");
  };
  const tipo = lista("Q2") || "um imóvel";
  const regiao = respostas.Q3?.texto?.trim();
  const valor = respostas.Q4?.v?.[0];
  const objetivo = respostas.Q1?.v?.[0] === "Ambos" ? "morar e investir" : (respostas.Q1?.v?.[0] ?? "").toLowerCase();
  const prazo = lista("Q6");
  return `Então, se eu entendi bem, você procura ${tipo}${regiao ? ` em ${regiao}` : ""}${valor && valor !== "Ainda não sabe" ? `, ${valor.toLowerCase()}` : ""}${objetivo ? `, para ${objetivo}` : ""}${prazo ? `, e quer resolver em ${prazo}` : ""}. É isso?`;
}

export function preencherFala(fala: string, ctx: { nome: string; assistente: string; imovel: string | null; respostas: Respostas }): string {
  if (fala === "[devolucao]") return falaDeDevolucao(ctx.respostas);
  return fala
    .replace(/\[Nome\]/g, ctx.nome)
    .replace(/\[Assistente\]/g, ctx.assistente)
    .replace(/\[Imobiliária\]/g, "RE/MAX Engimob")
    .replace(/\s?\[imóvel\]/g, ctx.imovel ? ` ${ctx.imovel}` : "");
}
