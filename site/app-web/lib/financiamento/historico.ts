import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  COLUNA_FIN_POR_ID,
  TIPO_CONFORMIDADE,
  TIPO_ETAPA,
  TIPO_INCONFORMIDADE,
  TIPO_NOTA_FIN,
  colunaDoCard,
  etapaDoCard,
  normalizarStatusAndamento
} from "@/lib/financiamento/quadro";

// Traz para as atividades do Financiamento o histórico que já existe no log de
// alterações do sistema (logs_alteracao, desde 17/07/2026): criação da avaliação,
// mudanças de status da avaliação e do andamento, envio de e-mail da consulta de
// CPF e de imagem pelo corretor. Cada mudança vira uma etapa com início e fim
// reais (o que antes era só estimado). Mudanças já feitas pelo quadro não são
// importadas de novo (o quadro já registra). Idempotente: refaz as atividades
// marcadas como importadas.
export const MARCA_HISTORICO = "importado-log";

type Evento = {
  t: Date;
  por: string | null;
  tipo:
    | "av_criada"
    | "av_status"
    | "and_criado"
    | "and_status"
    | "and_removido"
    | "email_cpf"
    | "imagem_cpf";
  de?: string | null;
  para?: string | null;
  andId?: string;
};

export type ResumoHistorico = {
  avaliacoes: number;
  etapas: number;
  notas: number;
  conformidades: number;
  inconformidades: number;
  substituiramEstimadas: number;
  exemplos: { cliente: string; linhas: string[] }[];
};

type EtapaCalc = { coluna: string; etapa: string; inicio: Date; fim: Date | null; estimado: boolean; por: string | null };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

export async function importarHistoricoFinanciamento(opcoes: { aplicar: boolean }): Promise<ResumoHistorico> {
  const logs = await prisma.logs_alteracao.findMany({
    where: { entidade_tipo: { in: ["avaliacoes", "andamentos"] } },
    orderBy: { criado_em: "asc" },
    select: { entidade_tipo: true, entidade_id: true, acao: true, dados_antes: true, dados_depois: true, criado_em: true, parceiro_id: true }
  });

  // andamento -> avaliação (alguns logs de andamento não trazem o avaliacao_id)
  const idsAndamento = [...new Set(logs.filter((l) => l.entidade_tipo === "andamentos" && l.entidade_id).map((l) => l.entidade_id!))];
  const andamentos = await prisma.andamentos.findMany({ where: { id: { in: idsAndamento } }, select: { id: true, avaliacao_id: true } });
  const avaliacaoDoAndamento = new Map(andamentos.map((a) => [a.id, a.avaliacao_id]));
  const todosAndamentos = await prisma.andamentos.findMany({ select: { id: true, created_at: true } });
  const criacaoAndamento = new Map(todosAndamentos.map((a) => [a.id, a.created_at.getTime()]));

  const porAvaliacao = new Map<string, Evento[]>();
  const add = (avaliacaoId: string | null | undefined, ev: Evento) => {
    if (!avaliacaoId) return;
    if (!porAvaliacao.has(avaliacaoId)) porAvaliacao.set(avaliacaoId, []);
    porAvaliacao.get(avaliacaoId)!.push(ev);
  };

  for (const l of logs) {
    const antes = (l.dados_antes ?? {}) as Record<string, unknown>;
    const depois = (l.dados_depois ?? {}) as Record<string, unknown>;
    if (depois.origem === "quadro-financiamento") continue; // já registrado pelo quadro
    const base = { t: l.criado_em, por: l.parceiro_id };

    if (l.entidade_tipo === "avaliacoes") {
      const id = l.entidade_id;
      if (l.acao === "criar" || l.acao === "criar_avaliacao_cpf") add(id, { ...base, tipo: "av_criada", para: str(depois.status) });
      else if (l.acao === "editar") {
        const de = str(antes.status);
        const para = str(depois.status);
        if (de && para && de !== para) add(id, { ...base, tipo: "av_status", de, para });
      } else if (l.acao === "email_avaliacao_cpf_enviado") add(id, { ...base, tipo: "email_cpf" });
      else if (l.acao === "enviar_imagem_consulta_corretor") add(id, { ...base, tipo: "imagem_cpf" });
    } else {
      const id = str(depois.avaliacao_id) ?? str(antes.avaliacao_id) ?? avaliacaoDoAndamento.get(l.entidade_id ?? "") ?? null;
      const andId = l.entidade_id ?? undefined;
      if (l.acao === "criar") add(id, { ...base, tipo: "and_criado", para: str(depois.status_andamento), andId });
      else if (l.acao === "editar") {
        const de = str(antes.status_andamento);
        const para = str(depois.status_andamento);
        if (de && para && de !== para) add(id, { ...base, tipo: "and_status", de, para, andId });
      } else if (l.acao === "excluir") add(id, { ...base, tipo: "and_removido", de: str(antes.status_andamento), andId });
    }
  }

  const ids = [...porAvaliacao.keys()];
  const [avaliacoes, doQuadro] = await Promise.all([
    prisma.avaliacoes.findMany({
      where: { id: { in: ids }, excluido: false },
      select: {
        id: true,
        status: true,
        data_avaliacao: true,
        created_at: true,
        clientes: { select: { nome: true } },
        andamentos: { where: { excluido: false }, orderBy: { created_at: "desc" }, take: 1, select: { id: true, status_andamento: true } }
      }
    }),
    // primeira etapa registrada pelo quadro (a partir dali o quadro já mede)
    prisma.financiamento_atividades.groupBy({
      by: ["avaliacao_id"],
      where: { tipo: TIPO_ETAPA, por_parceiro_id: { not: null }, resultado: null, estimado: false, avaliacao_id: { in: ids } },
      _min: { inicio: true }
    })
  ]);
  const t0PorAvaliacao = new Map(doQuadro.map((x) => [x.avaliacao_id, x._min.inicio]));

  const resumo: ResumoHistorico = { avaliacoes: 0, etapas: 0, notas: 0, conformidades: 0, inconformidades: 0, substituiramEstimadas: 0, exemplos: [] };
  const criarLista: Prisma.financiamento_atividadesCreateManyInput[] = [];
  const apagarAvaliacoes: string[] = [];

  for (const av of avaliacoes) {
    const eventos = (porAvaliacao.get(av.id) ?? []).sort((a, b) => a.t.getTime() - b.t.getTime());
    const t0 = t0PorAvaliacao.get(av.id) ?? null;
    const validos = t0 ? eventos.filter((e) => e.t < t0) : eventos;
    if (validos.length === 0) continue;

    const andAtual = av.andamentos[0] ?? null;
    const primeiroAv = validos.find((e) => e.tipo === "av_criada" || e.tipo === "av_status");
    const primeiroAnd = validos.find((e) => e.tipo === "and_criado" || e.tipo === "and_status");

    // estado inicial (antes do 1º evento)
    let avStatus = primeiroAv ? (primeiroAv.tipo === "av_criada" ? (primeiroAv.para ?? "Consulta de CPF") : primeiroAv.de!) : av.status;

    // Andamentos: cada um tem seu próprio status; o do card é o do mais recente
    // que não foi removido (uma avaliação pode ter tido mais de um andamento).
    const ands = new Map<string, { status: string | null; removido: boolean }>();
    for (const e of validos) {
      if (!e.andId || ands.has(e.andId)) continue;
      if (e.tipo === "and_criado") ands.set(e.andId, { status: null, removido: false });
      else ands.set(e.andId, { status: e.de ?? null, removido: false }); // já existia antes do log
    }
    const semEventosAnd = ands.size === 0;
    const statusDoAndamentoAtivo = (): string | null => {
      if (semEventosAnd) return andAtual ? normalizarStatusAndamento(andAtual.status_andamento, avStatus) : null;
      let melhor: { status: string; t: number } | null = null;
      for (const [id, st] of ands) {
        if (st.removido || st.status === null) continue;
        const t = criacaoAndamento.get(id) ?? 0;
        if (!melhor || t > melhor.t) melhor = { status: st.status, t };
      }
      return melhor ? normalizarStatusAndamento(melhor.status, avStatus) : null;
    };
    let andStatus: string | null = statusDoAndamentoAtivo();

    const etapas: EtapaCalc[] = [];
    const notas: { t: Date; por: string | null; titulo: string }[] = [];
    const conf: { t: Date; por: string | null; tipo: string; fim: Date | null }[] = [];

    const estadoAtual = () => {
      const coluna = colunaDoCard(avStatus, andStatus);
      return { coluna, etapa: etapaDoCard(avStatus, andStatus) };
    };
    const abrir = (t: Date, por: string | null, estimado: boolean) => {
      const { coluna, etapa } = estadoAtual();
      const ultima = etapas[etapas.length - 1];
      if (ultima && ultima.etapa === etapa && ultima.coluna === coluna) return;
      if (ultima) ultima.fim = t;
      etapas.push({ coluna, etapa, inicio: t, fim: null, estimado, por });
    };

    // 1ª etapa: criação real (log) ou início estimado pelas datas cadastradas
    const primeiro = validos[0];
    const criadaNoLog = primeiroAv?.tipo === "av_criada" && primeiroAv === primeiro;
    const inicioPrimeira = criadaNoLog ? primeiro.t : (av.data_avaliacao ?? av.created_at);
    const inicioSeguro = inicioPrimeira.getTime() > primeiro.t.getTime() ? primeiro.t : inicioPrimeira;
    abrir(inicioSeguro, criadaNoLog ? primeiro.por : null, !criadaNoLog);

    for (const e of validos) {
      if (e.tipo === "av_criada") {
        notas.push({ t: e.t, por: e.por, titulo: "Avaliação criada" });
        if (e.para) avStatus = e.para;
        if (e !== primeiro) abrir(e.t, e.por, false);
      } else if (e.tipo === "av_status") {
        avStatus = e.para!;
        andStatus = statusDoAndamentoAtivo();
        abrir(e.t, e.por, false);
      } else if (e.tipo === "and_criado") {
        if (e.andId) ands.set(e.andId, { status: e.para ?? "Pendente", removido: false });
        andStatus = statusDoAndamentoAtivo();
        notas.push({ t: e.t, por: e.por, titulo: "Andamento iniciado" });
        abrir(e.t, e.por, false);
        if (e.para === "Inconforme") conf.push({ t: e.t, por: e.por, tipo: TIPO_INCONFORMIDADE, fim: null });
        if (e.para === "Conforme") conf.push({ t: e.t, por: e.por, tipo: TIPO_CONFORMIDADE, fim: e.t });
      } else if (e.tipo === "and_status") {
        if (e.andId) ands.set(e.andId, { status: e.para!, removido: false });
        andStatus = statusDoAndamentoAtivo();
        abrir(e.t, e.por, false);
        // inconformidade aberta é resolvida na próxima mudança de status
        const aberta = [...conf].reverse().find((c) => c.tipo === TIPO_INCONFORMIDADE && !c.fim);
        if (aberta && e.para !== "Inconforme") aberta.fim = e.t;
        if (e.para === "Inconforme") conf.push({ t: e.t, por: e.por, tipo: TIPO_INCONFORMIDADE, fim: null });
        if (e.para === "Conforme") conf.push({ t: e.t, por: e.por, tipo: TIPO_CONFORMIDADE, fim: e.t });
      } else if (e.tipo === "and_removido") {
        if (e.andId) ands.set(e.andId, { status: ands.get(e.andId)?.status ?? null, removido: true });
        andStatus = statusDoAndamentoAtivo();
        notas.push({ t: e.t, por: e.por, titulo: "Andamento removido" });
        abrir(e.t, e.por, false);
      } else if (e.tipo === "email_cpf") notas.push({ t: e.t, por: e.por, titulo: "E-mail da consulta de CPF enviado" });
      else if (e.tipo === "imagem_cpf") notas.push({ t: e.t, por: e.por, titulo: "Imagem da consulta enviada pelo corretor" });
    }

    // Fecha/ajusta a última etapa.
    const ultima = etapas[etapas.length - 1];
    if (t0) {
      ultima.fim = t0; // dali em diante, o quadro mede
    } else {
      const atual = { coluna: colunaDoCard(av.status, andAtual?.status_andamento ?? null), etapa: etapaDoCard(av.status, andAtual?.status_andamento ?? null) };
      if (ultima.etapa !== atual.etapa || ultima.coluna !== atual.coluna) {
        // o cadastro mudou fora do log: abre a etapa atual (início estimado)
        const ultimoEvento = validos[validos.length - 1].t;
        ultima.fim = ultimoEvento;
        etapas.push({ ...atual, inicio: ultimoEvento, fim: null, estimado: true, por: null });
      }
      const fimLinha = etapas[etapas.length - 1];
      if (COLUNA_FIN_POR_ID.get(fimLinha.coluna as never)?.grupo === "fim") fimLinha.fim = fimLinha.inicio;
    }

    const noProcesso = (col: string) => COLUNA_FIN_POR_ID.get(col as never)?.grupo === "processo";
    for (const e of etapas) {
      criarLista.push({
        avaliacao_id: av.id,
        andamento_id: noProcesso(e.coluna) ? (andAtual?.id ?? null) : null,
        tipo: TIPO_ETAPA,
        coluna: e.coluna,
        etapa: e.etapa,
        resultado: MARCA_HISTORICO,
        inicio: e.inicio,
        fim: e.fim,
        estimado: e.estimado,
        por_parceiro_id: e.por
      });
    }
    for (const n of notas) {
      criarLista.push({
        avaliacao_id: av.id,
        andamento_id: andAtual?.id ?? null,
        tipo: TIPO_NOTA_FIN,
        etapa: n.titulo,
        resultado: MARCA_HISTORICO,
        inicio: n.t,
        fim: n.t,
        por_parceiro_id: n.por
      });
    }
    for (const c of conf) {
      criarLista.push({
        avaliacao_id: av.id,
        andamento_id: andAtual?.id ?? null,
        tipo: c.tipo,
        coluna: "conformidade",
        etapa: c.tipo === TIPO_CONFORMIDADE ? "Conforme" : "Inconforme",
        resultado: c.tipo === TIPO_CONFORMIDADE ? "Conforme" : c.fim ? "Resolvida" : "Aberta",
        motivo: c.tipo === TIPO_INCONFORMIDADE ? "Não informado (histórico)" : null,
        nota: "Importado do histórico de alterações",
        inicio: c.t,
        fim: c.fim,
        por_parceiro_id: c.por
      });
    }

    apagarAvaliacoes.push(av.id);
    resumo.avaliacoes += 1;
    resumo.etapas += etapas.length;
    resumo.notas += notas.length;
    resumo.conformidades += conf.filter((c) => c.tipo === TIPO_CONFORMIDADE).length;
    resumo.inconformidades += conf.filter((c) => c.tipo === TIPO_INCONFORMIDADE).length;
    if (resumo.exemplos.length < 5 && etapas.length >= 3) {
      resumo.exemplos.push({
        cliente: av.clientes?.nome ?? "—",
        linhas: etapas.map(
          (e) => `${e.etapa}${e.estimado ? "*" : ""}: ${e.inicio.toISOString().slice(0, 10)} → ${e.fim ? e.fim.toISOString().slice(0, 10) : "em andamento"}`
        )
      });
    }
  }

  if (opcoes.aplicar && apagarAvaliacoes.length > 0) {
    // Remove o histórico importado antes (idempotência) e as etapas apenas
    // estimadas (sem autor) dessas avaliações — substituídas pelas reais.
    const removidas = await prisma.$transaction([
      prisma.financiamento_atividades.deleteMany({ where: { avaliacao_id: { in: apagarAvaliacoes }, resultado: MARCA_HISTORICO } }),
      prisma.financiamento_atividades.deleteMany({
        where: { avaliacao_id: { in: apagarAvaliacoes }, tipo: TIPO_ETAPA, estimado: true, por_parceiro_id: null, resultado: null }
      }),
      prisma.financiamento_atividades.createMany({ data: criarLista })
    ]);
    resumo.substituiramEstimadas = removidas[1].count;
  }
  return resumo;
}
