"use server";

import { after } from "next/server";
import { avisarMovimento } from "@/lib/quadro-log";
import { primeiroNome } from "@/lib/whatsapp";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { hojeComoDataCalendario } from "@/lib/format";
import {
  CAMPOS_DATA,
  CAMPOS_TEXTO,
  CADENCIA_FOLLOWUP,
  CHAVES_DIAGNOSTICO,
  COLUNA_POR_ID,
  DIAS_INSCRICAO_ANTES_TURMA,
  TIPO_MOVIMENTACAO,
  colunaDoParceiro,
  ehEtapaFunil,
  type ColunaId
} from "@/lib/recrutamento/opcoes";
import { CHAVES_TREINAMENTO, presencaTurma, type EstadoTreinamentos } from "@/lib/recrutamento/treinamentos";

type Resultado = { ok: true } | { ok: false; erro: string };

function limpoOuNull(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}

const DIA_MS = 86400000;

// ---------------------------------------------------------------------------
// Mover o card entre colunas (arrastar e soltar no quadro, ou o seletor
// "Etapa" dentro da etiqueta). Regras:
//  - Funil (Lead … Em treinamento): só altera a etapa. Vindo de "Sem
//    interesse", reativa o recrutado. Entrar em "Em treinamento" sugere a
//    próxima turma (inscrições fecham 3 dias antes) e marca o início.
//  - Corretor Estagiário / Corretor (acolhida): muda a função, deixa Ativo e
//    grava a data de entrada. Se o recrutado está numa turma, só libera com
//    100% de presença (regra dos 100%) — a menos que os gestores liberem
//    (opcoes.forcar).
//  - Saída: só pra quem já é Corretor/Estagiário. Deixa Inativo; com CRECI
//    vira Corretor Externo, sem CRECI vira Desligado (data de saída = hoje).
//  - Sem interesse: só pra quem ainda está no funil e EXIGE o motivo (100% dos
//    casos com motivo registrado).
//  - Quem já é corretor não volta pro funil, e quem saiu é reativado pelo
//    cadastro do parceiro.
// Lança Error com mensagem em português quando recusa (o quadro mostra).
// ---------------------------------------------------------------------------
export async function moverCardRecrutamentoAction(
  parceiroId: string,
  destino: ColunaId,
  opcoes?: { motivo?: string | null; motivoObs?: string | null; forcar?: boolean }
): Promise<void> {
  const sessao = await requireAdminSession();
  if (!COLUNA_POR_ID.has(destino)) throw new Error("Coluna inválida.");

  // Leituras em paralelo (uma ida só ao banco em vez de várias em fila).
  const [parceiro, linha, padraoEtapa] = await Promise.all([
    prisma.parceiros.findUnique({
      where: { id: parceiroId },
      select: { id: true, nome: true, funcao: true, status_funcao: true, creci: true, data_entrada: true, data_saida: true }
    }),
    prisma.recrutamento.findUnique({
      where: { parceiro_id: parceiroId },
      select: { etapa: true, inicio_treinamento: true, turma_id: true, treinamentos: true, acolhida_em: true }
    }),
    prisma.recrutamento_etapas.findUnique({ where: { etapa: destino }, select: { responsavel_id: true } })
  ]);
  if (!parceiro) throw new Error("Parceiro não encontrado.");

  const origem = colunaDoParceiro(parceiro, linha?.etapa);
  if (!origem) throw new Error("Esse parceiro não faz parte do quadro de Recrutamento.");
  if (origem === destino) return;

  const hoje = hojeComoDataCalendario();
  const origemFunil = ehEtapaFunil(origem);
  const destinoFunil = ehEtapaFunil(destino);
  const dadosParceiro: Record<string, unknown> = {};
  const dadosLinha: Record<string, unknown> = { etapa_atualizada_em: new Date(), updated_at: new Date() };
  const motivo = limpoOuNull(opcoes?.motivo);

  if (destinoFunil) {
    if (!origemFunil && origem !== "sem_interesse") {
      throw new Error(
        origem === "saida"
          ? "Quem já saiu não volta pelo quadro — reative pelo cadastro do parceiro."
          : "Quem já é corretor não volta para o funil de recrutamento."
      );
    }
    if (origem === "sem_interesse") {
      dadosParceiro.status_funcao = "Ativo";
      dadosLinha.motivo_desistencia = null;
      dadosLinha.motivo_obs = null;
    }
    dadosLinha.etapa = destino;
    if (destino === "Em treinamento") {
      if (!linha?.inicio_treinamento) dadosLinha.inicio_treinamento = hoje;
      // Sem turma definida: sugere a próxima (inscrições fecham 3 dias antes).
      if (!linha?.turma_id) {
        const limite = new Date(hoje.getTime() + DIAS_INSCRICAO_ANTES_TURMA * DIA_MS);
        const proxima = await prisma.recrutamento_turmas.findFirst({
          where: { inicio: { gte: limite } },
          orderBy: { inicio: "asc" },
          select: { id: true }
        });
        if (proxima) dadosLinha.turma_id = proxima.id;
      }
    }
    // Responsável padrão da etapa (configurado no quadro), quando existe.
    if (padraoEtapa?.responsavel_id) dadosLinha.responsavel_id = padraoEtapa.responsavel_id;
  } else if (destino === "estagiario" || destino === "corretor") {
    if (origem === "saida") throw new Error("Quem já saiu não volta pelo quadro — reative pelo cadastro do parceiro.");
    if (origem === "sem_interesse") throw new Error("Mova primeiro para uma etapa do funil e depois para Corretor.");
    // Regra dos 100%: com turma definida, só acolhe quem tem todas as presenças.
    if (origemFunil && linha?.turma_id && !opcoes?.forcar) {
      const p = presencaTurma(linha.treinamentos as EstadoTreinamentos | null);
      if (p.feitas < p.total) {
        throw new Error(
          `Presença incompleta (${p.feitas} de ${p.total}). A acolhida só é liberada com 100% da turma — registre as presenças na etiqueta ou peça a liberação dos gestores.`
        );
      }
    }
    dadosParceiro.funcao = destino === "estagiario" ? "Corretor Estagiário" : "Corretor";
    dadosParceiro.status_funcao = "Ativo";
    if (!parceiro.data_entrada) dadosParceiro.data_entrada = hoje;
    if (origemFunil) {
      dadosLinha.etapa = "Em treinamento";
      if (!linha?.acolhida_em) dadosLinha.acolhida_em = hoje;
    }
  } else if (destino === "saida") {
    if (origem !== "estagiario" && origem !== "corretor") {
      throw new Error("Saída é só para quem já é Corretor ou Corretor Estagiário. Para recrutado que não seguiu, use “Sem interesse”.");
    }
    dadosParceiro.status_funcao = "Inativo";
    dadosParceiro.funcao = parceiro.creci ? "Corretor Externo" : "Desligado";
    if (!parceiro.data_saida) dadosParceiro.data_saida = hoje;
  } else if (destino === "sem_interesse") {
    if (!origemFunil) throw new Error("“Sem interesse” é só para quem ainda está no funil de recrutamento.");
    if (!motivo) throw new Error("Informe o motivo da desistência (todos os casos precisam de motivo registrado).");
    dadosParceiro.status_funcao = "Inativo";
    dadosLinha.motivo_desistencia = motivo;
    dadosLinha.motivo_obs = limpoOuNull(opcoes?.motivoObs);
  }

  // Escritas em lote (uma ida só ao banco). Não revalida /recrutamento aqui: o
  // quadro já atualizou o card na tela e recarregar tudo de novo era o que
  // deixava o arraste lento.
  const resultadoTexto =
    `${COLUNA_POR_ID.get(origem)?.label} → ${COLUNA_POR_ID.get(destino)?.label}` +
    (destino === "sem_interesse" && motivo ? ` (motivo: ${motivo})` : "") +
    (opcoes?.forcar ? " (liberado pelos gestores)" : "");
  const escritas = [
    ...(Object.keys(dadosParceiro).length > 0
      ? [prisma.parceiros.update({ where: { id: parceiroId }, data: { ...dadosParceiro, updated_at: new Date() } })]
      : []),
    prisma.recrutamento.upsert({
      where: { parceiro_id: parceiroId },
      create: { parceiro_id: parceiroId, ...(dadosLinha as object) },
      update: dadosLinha as object
    }),
    prisma.recrutamento_atividades.create({
      data: {
        parceiro_id: parceiroId,
        tipo: TIPO_MOVIMENTACAO,
        resultado: resultadoTexto,
        nota: destino === "sem_interesse" ? limpoOuNull(opcoes?.motivoObs) : null,
        por_parceiro_id: sessao.parceiroId
      }
    })
  ];
  await prisma.$transaction(escritas);

  avisarMovimento("recrutamento", sessao.parceiroId, async () => ({
    titulo: `Recrutamento · ${parceiro.nome}`,
    corpo: `${COLUNA_POR_ID.get(origem)?.label} → ${COLUNA_POR_ID.get(destino)?.label} · por ${primeiroNome(sessao.nome)}`,
    url: `/recrutamento/${parceiroId}`,
    tag: `recrutamento-${parceiroId}`
  }));

  if (Object.keys(dadosParceiro).length > 0) {
    // Log de auditoria fora do caminho crítico (não segura a resposta).
    // (grava direto, com o id lido da sessão acima — dentro do after() não dá
    // pra ler o cookie da requisição.)
    const quem = sessao.parceiroId;
    const antes = { funcao: parceiro.funcao, status_funcao: parceiro.status_funcao };
    const depois = JSON.parse(JSON.stringify({ ...dadosParceiro, origem: "recrutamento" }));
    after(async () => {
      await prisma.logs_alteracao
        .create({
          data: {
            parceiro_id: quem,
            entidade_tipo: "parceiros",
            entidade_id: parceiroId,
            acao: "editar",
            dados_antes: antes,
            dados_depois: depois
          }
        })
        .catch(() => {});
    });
  }
}

// ---------------------------------------------------------------------------
// Autosave de um campo da etiqueta (texto, data, responsável ou turma).
// Chamado pela tela sem recarregar a página — por isso devolve { ok } em vez
// de redirecionar e NÃO revalida a própria etiqueta (só o quadro).
// ---------------------------------------------------------------------------
export async function salvarCampoRecrutamentoAction(
  parceiroId: string,
  campo: string,
  valor: string | null
): Promise<Resultado> {
  await requireAdminSession();
  try {
    let dados: Record<string, unknown>;
    if ((CAMPOS_TEXTO as readonly string[]).includes(campo)) {
      dados = { [campo]: limpoOuNull(valor) };
    } else if ((CAMPOS_DATA as readonly string[]).includes(campo)) {
      const v = limpoOuNull(valor);
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, erro: "Data inválida." };
      dados = { [campo]: v ? new Date(`${v}T00:00:00.000Z`) : null };
    } else if (campo === "responsavel_id") {
      const v = limpoOuNull(valor);
      if (v) {
        const existe = await prisma.parceiros.findUnique({ where: { id: v }, select: { id: true } });
        if (!existe) return { ok: false, erro: "Responsável não encontrado." };
      }
      dados = { responsavel_id: v };
    } else if (campo === "turma_id") {
      const v = limpoOuNull(valor);
      if (v) {
        const existe = await prisma.recrutamento_turmas.findUnique({ where: { id: v }, select: { id: true } });
        if (!existe) return { ok: false, erro: "Turma não encontrada." };
      }
      dados = { turma_id: v };
    } else {
      return { ok: false, erro: "Campo não permitido." };
    }

    await prisma.recrutamento.upsert({
      where: { parceiro_id: parceiroId },
      create: { parceiro_id: parceiroId, ...(dados as object) },
      update: { ...(dados as object), updated_at: new Date() }
    });
    revalidatePath("/recrutamento");
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "Não foi possível salvar." };
  }
}

// Marca/desmarca um item de checklist (documentação, presença na turma,
// acolhida e acessos). Alguns itens alimentam datas dos indicadores.
export async function alternarTreinamentoAction(parceiroId: string, chave: string, feito: boolean): Promise<Resultado> {
  await requireAdminSession();
  if (!CHAVES_TREINAMENTO.has(chave)) return { ok: false, erro: "Treinamento inválido." };
  try {
    const atual = await prisma.recrutamento.findUnique({ where: { parceiro_id: parceiroId }, select: { treinamentos: true } });
    const estado = ((atual?.treinamentos as EstadoTreinamentos | null) ?? {}) as EstadoTreinamentos;
    const hojeTexto = new Date().toISOString().slice(0, 10);
    const proximo: EstadoTreinamentos = {
      ...estado,
      [chave]: feito ? { feito: true, data: hojeTexto } : { feito: false }
    };
    const extras: Record<string, unknown> = {};
    // Contrato assinado = recrutado; acolhida feita = acolhido (indicadores).
    if (chave === "doc_contrato") extras.contrato_assinado_em = feito ? hojeComoDataCalendario() : null;
    if (chave === "acolhida") extras.acolhida_em = feito ? hojeComoDataCalendario() : null;
    await prisma.recrutamento.upsert({
      where: { parceiro_id: parceiroId },
      create: { parceiro_id: parceiroId, treinamentos: proximo, ...(extras as object) },
      update: { treinamentos: proximo, updated_at: new Date(), ...(extras as object) }
    });
    revalidatePath("/recrutamento");
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "Não foi possível salvar." };
  }
}

// Respostas do diagnóstico da 1ª reunião (autosave por pergunta).
export async function salvarDiagnosticoAction(parceiroId: string, chave: string, texto: string | null): Promise<Resultado> {
  await requireAdminSession();
  if (!CHAVES_DIAGNOSTICO.has(chave)) return { ok: false, erro: "Pergunta inválida." };
  try {
    const atual = await prisma.recrutamento.findUnique({ where: { parceiro_id: parceiroId }, select: { diagnostico: true } });
    const respostas = { ...((atual?.diagnostico as Record<string, string> | null) ?? {}) };
    const v = limpoOuNull(texto);
    if (v) respostas[chave] = v;
    else delete respostas[chave];
    await prisma.recrutamento.upsert({
      where: { parceiro_id: parceiroId },
      create: { parceiro_id: parceiroId, diagnostico: respostas },
      update: { diagnostico: respostas, updated_at: new Date() }
    });
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "Não foi possível salvar." };
  }
}

// Cadência de follow-up (D+1 … D+30): marca cada passo como feito.
export async function alternarFollowupAction(parceiroId: string, chave: string, feito: boolean): Promise<Resultado> {
  await requireAdminSession();
  if (!CADENCIA_FOLLOWUP.some((p) => p.chave === chave)) return { ok: false, erro: "Passo inválido." };
  try {
    const atual = await prisma.recrutamento.findUnique({ where: { parceiro_id: parceiroId }, select: { followups: true } });
    const estado = { ...((atual?.followups as Record<string, { feito: boolean; data?: string }> | null) ?? {}) };
    estado[chave] = feito ? { feito: true, data: new Date().toISOString().slice(0, 10) } : { feito: false };
    await prisma.recrutamento.upsert({
      where: { parceiro_id: parceiroId },
      create: { parceiro_id: parceiroId, followups: estado },
      update: { followups: estado, updated_at: new Date() }
    });
    revalidatePath("/recrutamento");
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "Não foi possível salvar." };
  }
}

export type AtividadeRegistrada = {
  id: string;
  tipo: string;
  resultado: string | null;
  nota: string | null;
  data: string;
  por: string | null;
};

// Registra um contato (ligação, WhatsApp, reunião, check-in...) e, se
// informada, atualiza a data do próximo retorno — é isso que alimenta o alerta
// de retorno atrasado.
export async function registrarAtividadeRecrutamentoAction(
  parceiroId: string,
  dados: { tipo: string; resultado: string | null; nota: string | null; proximaAcaoData: string | null }
): Promise<{ ok: true; atividade: AtividadeRegistrada } | { ok: false; erro: string }> {
  const sessao = await requireAdminSession();
  const tipo = limpoOuNull(dados.tipo);
  if (!tipo) return { ok: false, erro: "Escolha o tipo de contato." };
  const proxima = limpoOuNull(dados.proximaAcaoData);
  if (proxima && !/^\d{4}-\d{2}-\d{2}$/.test(proxima)) return { ok: false, erro: "Data do próximo retorno inválida." };
  try {
    const criada = await prisma.recrutamento_atividades.create({
      data: {
        parceiro_id: parceiroId,
        tipo,
        resultado: limpoOuNull(dados.resultado),
        nota: limpoOuNull(dados.nota),
        por_parceiro_id: sessao.parceiroId
      },
      include: { por: { select: { nome: true } } }
    });
    if (proxima) {
      await prisma.recrutamento.upsert({
        where: { parceiro_id: parceiroId },
        create: { parceiro_id: parceiroId, proxima_acao_data: new Date(`${proxima}T00:00:00.000Z`) },
        update: { proxima_acao_data: new Date(`${proxima}T00:00:00.000Z`), updated_at: new Date() }
      });
    }
    revalidatePath("/recrutamento");
    return {
      ok: true,
      atividade: {
        id: criada.id,
        tipo: criada.tipo,
        resultado: criada.resultado,
        nota: criada.nota,
        data: criada.data.toISOString(),
        por: criada.por?.nome ?? null
      }
    };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "Não foi possível registrar." };
  }
}

// Responsável padrão de cada etapa (aparece no topo da coluna; ao mover um
// card pra etapa, ele vira o responsável do card).
export async function definirResponsavelEtapaAction(etapa: string, responsavelId: string | null): Promise<Resultado> {
  await requireAdminSession();
  if (!COLUNA_POR_ID.has(etapa as ColunaId)) return { ok: false, erro: "Etapa inválida." };
  try {
    const v = limpoOuNull(responsavelId);
    await prisma.recrutamento_etapas.upsert({
      where: { etapa },
      create: { etapa, responsavel_id: v },
      update: { responsavel_id: v, updated_at: new Date() }
    });
    revalidatePath("/recrutamento");
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "Não foi possível salvar." };
  }
}

// ---------------------------------------------------------------------------
// Turmas (calendário quinzenal) — datas editáveis pra ajustar feriado.
// ---------------------------------------------------------------------------
const CAMPOS_TURMA_DATA = ["inicio", "passos_inicio", "passos_fim", "especificos_a", "especificos_b", "acolhida"] as const;

export async function salvarCampoTurmaAction(turmaId: string, campo: string, valor: string | null): Promise<Resultado> {
  await requireAdminSession();
  try {
    let dados: Record<string, unknown>;
    if ((CAMPOS_TURMA_DATA as readonly string[]).includes(campo)) {
      const v = limpoOuNull(valor);
      if (!v && campo === "inicio") return { ok: false, erro: "A turma precisa de uma data de início." };
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, erro: "Data inválida." };
      dados = { [campo]: v ? new Date(`${v}T00:00:00.000Z`) : null };
    } else if (campo === "observacao" || campo === "nome") {
      const v = limpoOuNull(valor);
      if (!v && campo === "nome") return { ok: false, erro: "A turma precisa de um nome." };
      dados = { [campo]: v };
    } else {
      return { ok: false, erro: "Campo não permitido." };
    }
    await prisma.recrutamento_turmas.update({ where: { id: turmaId }, data: { ...(dados as object), updated_at: new Date() } });
    revalidatePath("/recrutamento/turmas");
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "Não foi possível salvar." };
  }
}

export async function criarTurmaAction(nome: string, inicio: string): Promise<Resultado> {
  await requireAdminSession();
  const n = limpoOuNull(nome);
  if (!n) return { ok: false, erro: "Informe o nome da turma." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return { ok: false, erro: "Informe a data de início." };
  try {
    await prisma.recrutamento_turmas.create({ data: { nome: n, inicio: new Date(`${inicio}T00:00:00.000Z`) } });
    revalidatePath("/recrutamento/turmas");
    return { ok: true };
  } catch (erro) {
    return {
      ok: false,
      erro: erro instanceof Error && erro.message.includes("Unique") ? "Já existe uma turma com esse nome." : "Não foi possível criar a turma."
    };
  }
}
