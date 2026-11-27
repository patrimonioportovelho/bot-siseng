import { PERGUNTAS, type Opcao, type Pergunta } from "@/lib/crm/roteiro";

// Alterações do roteiro feitas pelo administrativo na tela "Editar roteiro". O conteúdo original continua em roteiro.ts;
// aqui ficam só as diferenças: textos, rótulos, opções escondidas e opções novas (que funcionam como uma já existente,
// para nunca criar um caminho sem saída).

export type EdicaoOpcao = { rotulo?: string; resposta?: string; oculta?: boolean };
export type OpcaoNova = { id: string; rotulo: string; igualA?: string; resposta?: string; oculta?: boolean };
export type EdicaoPergunta = { texto?: string; fala?: string; dica?: string; opcoes?: Record<string, EdicaoOpcao>; novas?: OpcaoNova[] };
export type EdicoesRoteiro = Record<string, EdicaoPergunta>;

export const MAXIMO_NOVAS = 15;

// perguntas em que não dá para criar opção (o sistema depende exatamente das que existem)
const SEM_OPCAO_NOVA = new Set(["IND", "Q_CONF", "D0", "D_NQ_NOV"]);
export const aceitaOpcaoNova = (p: Pergunta) => (p.tipo === "unica" || p.tipo === "multipla") && !SEM_OPCAO_NOVA.has(p.id);

// opções que não podem ser escondidas: LGPD, desfechos, indicação, confirmação e "Nada novo"
const FIXAS: Record<string, string[] | "todas"> = { D_NQ_NOV: "todas", D0: "todas", IND: "todas", Q_CONF: "todas", O0: "todas", O2: "todas", R1: ["Nada novo"] };
export const podeEsconder = (perguntaId: string, opcaoId: string) => {
  const f = FIXAS[perguntaId];
  return f !== "todas" && !f?.includes(opcaoId);
};

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);

// Confere o que veio da tela e guarda só o que difere do original. null = nada mudou (volta ao original).
export function limparEdicao(base: Pergunta, entrada: unknown): { ok: true; edicao: EdicaoPergunta | null } | { ok: false; erro: string } {
  const e = (entrada ?? {}) as EdicaoPergunta;
  const out: EdicaoPergunta = {};

  const t = texto(e.texto, 200);
  if (t !== undefined && !t) return { ok: false, erro: "A pergunta não pode ficar em branco." };
  if (t && t !== base.texto) out.texto = t;
  const fala = texto(e.fala, 600);
  // a fala da confirmação é montada com as respostas
  if (base.id !== "Q_CONF" && fala !== undefined && fala !== (base.fala ?? "")) out.fala = fala;
  const dica = texto(e.dica, 400);
  if (dica !== undefined && dica !== (base.dica ?? "")) out.dica = dica;

  const opcoes: Record<string, EdicaoOpcao> = {};
  for (const o of base.opcoes ?? []) {
    const m = e.opcoes?.[o.id];
    if (!m) continue;
    const d: EdicaoOpcao = {};
    const rotulo = texto(m.rotulo, 80);
    if (rotulo !== undefined && !rotulo) return { ok: false, erro: "Uma opção ficou sem texto." };
    if (rotulo && rotulo !== o.rotulo) d.rotulo = rotulo;
    const resposta = texto(m.resposta, 400);
    if (o.resposta !== undefined && resposta !== undefined && resposta !== o.resposta) d.resposta = resposta;
    if (m.oculta) {
      if (!podeEsconder(base.id, o.id)) return { ok: false, erro: `A opção “${o.rotulo}” não pode ser escondida.` };
      d.oculta = true;
    }
    if (Object.keys(d).length) opcoes[o.id] = d;
  }
  if (Object.keys(opcoes).length) out.opcoes = opcoes;

  const novas: OpcaoNova[] = [];
  for (const n of Array.isArray(e.novas) ? e.novas : []) {
    if (!aceitaOpcaoNova(base)) return { ok: false, erro: "Esta pergunta não aceita opção nova." };
    const rotulo = texto(n?.rotulo, 80);
    if (!rotulo) return { ok: false, erro: "Escreva o texto da opção nova." };
    if (typeof n.id !== "string" || !/^nova_[a-z0-9]{1,24}$/.test(n.id) || novas.some((x) => x.id === n.id)) return { ok: false, erro: "Opção nova inválida. Recarregue a página." };
    const igualA = base.opcoes?.some((o) => o.id === n.igualA) ? n.igualA : undefined;
    // numa escolha única, é a opção copiada que diz para onde o roteiro segue
    if (base.tipo === "unica" && !igualA) return { ok: false, erro: `Escolha com qual opção “${rotulo}” deve funcionar igual.` };
    const resposta = texto(n.resposta, 400);
    novas.push({ id: n.id, rotulo, ...(igualA ? { igualA } : {}), ...(resposta ? { resposta } : {}), ...(n.oculta ? { oculta: true } : {}) });
  }
  if (novas.length > MAXIMO_NOVAS) return { ok: false, erro: `No máximo ${MAXIMO_NOVAS} opções novas por pergunta.` };
  if (novas.length) out.novas = novas;

  if (base.opcoes?.length) {
    const visiveis = base.opcoes.filter((o) => !opcoes[o.id]?.oculta).length + novas.filter((n) => !n.oculta).length;
    if (visiveis === 0) return { ok: false, erro: "Deixe pelo menos uma opção visível." };
  }
  return { ok: true, edicao: Object.keys(out).length ? out : null };
}

// O roteiro como ele deve aparecer: o original com as alterações do administrativo.
export function aplicarEdicoes(edicoes: EdicoesRoteiro, base: Pergunta[] = PERGUNTAS): Pergunta[] {
  return base.map((p) => {
    const e = edicoes[p.id];
    if (!e) return p;
    const opcoes: Opcao[] | undefined = p.opcoes?.map((o) => {
      const m = e.opcoes?.[o.id];
      return m ? { ...o, rotulo: m.rotulo ?? o.rotulo, ...(m.resposta !== undefined ? { resposta: m.resposta } : {}), ...(m.oculta ? { oculta: true } : {}) } : o;
    });
    for (const n of e.novas ?? []) {
      const modelo = p.opcoes?.find((o) => o.id === n.igualA);
      opcoes?.push({
        ...(modelo ? { proximo: modelo.proximo, acoes: modelo.acoes, obsObrigatoria: modelo.obsObrigatoria, como: modelo.id } : {}),
        id: n.id,
        rotulo: n.rotulo,
        ...(n.resposta ? { resposta: n.resposta } : {}),
        ...(n.oculta ? { oculta: true } : {})
      });
    }
    return {
      ...p,
      texto: e.texto ?? p.texto,
      fala: e.fala !== undefined ? e.fala || undefined : p.fala,
      dica: e.dica !== undefined ? e.dica || undefined : p.dica,
      opcoes
    };
  });
}
