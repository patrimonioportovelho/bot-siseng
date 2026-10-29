"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { hojeComoDataCalendario } from "@/lib/format";
import {
  CAMPOS_DATA,
  CAMPOS_TEXTO,
  COLUNA_POR_ID,
  TIPO_MOVIMENTACAO,
  colunaDoParceiro,
  ehEtapaFunil,
  type ColunaId
} from "@/lib/recrutamento/opcoes";
import { CHAVES_TREINAMENTO, type EstadoTreinamentos } from "@/lib/recrutamento/treinamentos";

type Resultado = { ok: true } | { ok: false; erro: string };

function limpoOuNull(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}

// ---------------------------------------------------------------------------
// Mover o card entre colunas (arrastar e soltar no quadro, ou o seletor
// "Etapa" dentro da etiqueta). Regras:
//  - Funil (Lead … Em treinamento): só altera a etapa. Vindo de "Sem
//    interesse", reativa o recrutado.
//  - Corretor Estagiário / Corretor: muda a função do parceiro, deixa Ativo e
//    preenche a data de entrada (se ainda vazia).
//  - Saída: só pra quem já é Corretor/Estagiário. Deixa Inativo e aplica a
//    mesma regra de sempre do cadastro: com CRECI vira Corretor Externo, sem
//    CRECI vira Desligado (data de saída = hoje, se vazia).
//  - Sem interesse: só pra quem ainda está no funil (fica Recrutados Inativo).
//  - Quem já é corretor não volta pro funil, e quem saiu é reativado pelo
//    cadastro do parceiro (de propósito: evita desfazer a mudança de função
//    sem querer).
// Lança Error com mensagem em português quando recusa (o quadro mostra).
// ---------------------------------------------------------------------------
export async function moverCardRecrutamentoAction(parceiroId: string, destino: ColunaId): Promise<void> {
  const sessao = await requireAdminSession();
  if (!COLUNA_POR_ID.has(destino)) throw new Error("Coluna inválida.");

  // Leituras em paralelo (uma ida só ao banco em vez de várias em fila).
  const [parceiro, linha, padraoEtapa] = await Promise.all([
    prisma.parceiros.findUnique({
      where: { id: parceiroId },
      select: { id: true, nome: true, funcao: true, status_funcao: true, creci: true, data_entrada: true, data_saida: true }
    }),
    prisma.recrutamento.findUnique({ where: { parceiro_id: parceiroId }, select: { etapa: true, inicio_treinamento: true } }),
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

  if (destinoFunil) {
    if (!origemFunil && origem !== "sem_interesse") {
      throw new Error(
        origem === "saida"
          ? "Quem já saiu não volta pelo quadro — reative pelo cadastro do parceiro."
          : "Quem já é corretor não volta para o funil de recrutamento."
      );
    }
    if (origem === "sem_interesse") dadosParceiro.status_funcao = "Ativo";
    dadosLinha.etapa = destino;
    if (destino === "Em treinamento" && !linha?.inicio_treinamento) dadosLinha.inicio_treinamento = hoje;
    // Responsável padrão da etapa (configurado no quadro), quando existe.
    if (padraoEtapa?.responsavel_id) dadosLinha.responsavel_id = padraoEtapa.responsavel_id;
  } else if (destino === "estagiario" || destino === "corretor") {
    if (origem === "saida") throw new Error("Quem já saiu não volta pelo quadro — reative pelo cadastro do parceiro.");
    if (origem === "sem_interesse") throw new Error("Mova primeiro para uma etapa do funil e depois para Corretor.");
    dadosParceiro.funcao = destino === "estagiario" ? "Corretor Estagiário" : "Corretor";
    dadosParceiro.status_funcao = "Ativo";
    if (!parceiro.data_entrada) dadosParceiro.data_entrada = hoje;
    if (origemFunil) dadosLinha.etapa = "Em treinamento";
  } else if (destino === "saida") {
    if (origem !== "estagiario" && origem !== "corretor") {
      throw new Error("Saída é só para quem já é Corretor ou Corretor Estagiário. Para recrutado que não seguiu, use “Sem interesse”.");
    }
    dadosParceiro.status_funcao = "Inativo";
    dadosParceiro.funcao = parceiro.creci ? "Corretor Externo" : "Desligado";
    if (!parceiro.data_saida) dadosParceiro.data_saida = hoje;
  } else if (destino === "sem_interesse") {
    if (!origemFunil) throw new Error("“Sem interesse” é só para quem ainda está no funil de recrutamento.");
    dadosParceiro.status_funcao = "Inativo";
  }

  // Escritas em lote (uma ida só ao banco). Não revalida /recrutamento aqui: o
  // quadro já atualizou o card na tela e recarregar tudo de novo era o que
  // deixava o arraste lento.
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
        resultado: `${COLUNA_POR_ID.get(origem)?.label} → ${COLUNA_POR_ID.get(destino)?.label}`,
        por_parceiro_id: sessao.parceiroId
      }
    })
  ];
  await prisma.$transaction(escritas);

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
// Autosave de um campo da etiqueta (texto, data ou responsável). Chamado pela
// tela sem recarregar a página — por isso devolve { ok } em vez de redirecionar
// e NÃO revalida a própria etiqueta (só o quadro).
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

// Marca/desmarca um treinamento como acompanhado (autosave).
export async function alternarTreinamentoAction(parceiroId: string, chave: string, feito: boolean): Promise<Resultado> {
  await requireAdminSession();
  if (!CHAVES_TREINAMENTO.has(chave)) return { ok: false, erro: "Treinamento inválido." };
  try {
    const atual = await prisma.recrutamento.findUnique({ where: { parceiro_id: parceiroId }, select: { treinamentos: true } });
    const estado = ((atual?.treinamentos as EstadoTreinamentos | null) ?? {}) as EstadoTreinamentos;
    const proximo: EstadoTreinamentos = {
      ...estado,
      [chave]: feito ? { feito: true, data: new Date().toISOString().slice(0, 10) } : { feito: false }
    };
    await prisma.recrutamento.upsert({
      where: { parceiro_id: parceiroId },
      create: { parceiro_id: parceiroId, treinamentos: proximo },
      update: { treinamentos: proximo, updated_at: new Date() }
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

// Registra um contato (ligação, WhatsApp, reunião...) e, se informada, atualiza
// a data do próximo retorno — é isso que alimenta o alerta de retorno atrasado.
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
