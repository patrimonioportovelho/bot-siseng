import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hojeInputDate } from "@/lib/format";
import { registrarAviso } from "@/lib/avisos-equipe";
import { gerarProximoIdCliente } from "@/lib/clientes/id-legado";
import { TIPOS_ATIVIDADE_CRM, somarDias } from "@/lib/crm/atividades";
import { DESFECHOS, PERGUNTA_POR_ID, SEGMENTOS, VERSAO_ROTEIRO, type Desfecho, type Segmento } from "@/lib/crm/roteiro";
import { criarMotor, desfechoFinal, temOptOut, type Respostas } from "@/lib/crm/roteiro-motor";
import { aplicarEdicoes } from "@/lib/crm/roteiro-edicoes";
import { carregarEdicoes } from "@/lib/crm/roteiro-edicoes-servidor";
import { CAMPOS_FICHA, limparFicha, type FichaDados, type FichaDoCliente } from "@/lib/crm/ficha";
import { carregarFicha, criarGancho, gravarFicha } from "@/lib/crm/ficha-servidor";
import { carregarCrmDoCliente, clienteDoAtor, encerrarLembretesDeMarketing, limparRepasse, registrarLog, type Ator, type ContatoRegistrado } from "@/lib/crm/servidor";
import type { AtividadeCliente, CrmCliente } from "@/lib/crm/atividades";

// Execuções do roteiro de atendimento: salvar (pausar/retomar), descartar e concluir. Concluir grava, de uma vez, o
// contato em "Contatos e notas", a temperatura, a próxima atividade (obrigatória, menos no opt-out), os avisos ao
// corretor e ao administrativo, o gancho a lembrar e o cadastro de quem foi indicado.

export type AtendimentoTela = {
  id: string;
  segmento: Segmento;
  status: string;
  caminho: string[];
  respostas: Respostas;
  desfecho: Desfecho | null;
  temperatura: string | null;
  resumo: string | null;
  por: string | null;
  criadoEm: string;
  concluidoEm: string | null;
};

export type AtendimentosDoCliente = { aberto: AtendimentoTela | null; historico: AtendimentoTela[]; tentativasSeguidas: number };

type Resp<T> = ({ ok: true } & T) | { ok: false; erro: string };
type Linha = Awaited<ReturnType<typeof prisma.crm_atendimentos.findMany>>[number];

const paraTela = (a: Linha, nomes: Map<string, string>): AtendimentoTela => ({
  id: a.id,
  segmento: a.segmento as Segmento,
  status: a.status,
  caminho: a.caminho as string[],
  respostas: a.respostas as Respostas,
  desfecho: a.desfecho as Desfecho | null,
  temperatura: a.temperatura,
  resumo: a.resumo,
  por: a.por_parceiro_id ? (nomes.get(a.por_parceiro_id) ?? null) : null,
  criadoEm: a.created_at.toISOString(),
  concluidoEm: a.concluido_em ? a.concluido_em.toISOString() : null
});

// Quantas tentativas sem resposta seguidas o cliente já tem (zera quando há qualquer outro desfecho).
async function contarTentativas(clienteId: string): Promise<number> {
  const ultimos = await prisma.crm_atendimentos.findMany({ where: { cliente_id: clienteId, status: "concluido" }, orderBy: { concluido_em: "desc" }, take: 5, select: { desfecho: true } });
  let n = 0;
  for (const u of ultimos) {
    if (u.desfecho !== "tentativa") break;
    n++;
  }
  return n;
}

export async function carregarAtendimentos(clienteId: string): Promise<AtendimentosDoCliente> {
  const [linhas, tentativasSeguidas] = await Promise.all([
    prisma.crm_atendimentos.findMany({ where: { cliente_id: clienteId, status: { not: "cancelado" } }, orderBy: { created_at: "desc" }, take: 30 }),
    contarTentativas(clienteId)
  ]);
  const ids = [...new Set(linhas.map((l) => l.por_parceiro_id).filter((x): x is string => !!x))];
  const nomes = new Map((await prisma.parceiros.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })).map((p) => [p.id, p.nome]));
  const telas = linhas.map((l) => paraTela(l, nomes));
  return { aberto: telas.find((t) => t.status === "em_andamento") ?? null, historico: telas.filter((t) => t.status === "concluido"), tentativasSeguidas };
}

// O que vem do navegador: só ids que existem no roteiro e textos com tamanho limitado.
function limparDados(segmento: string, caminho: unknown, respostas: unknown): { segmento: Segmento; caminho: string[]; respostas: Respostas } | null {
  const seg = SEGMENTOS.find((s) => s.id === segmento)?.id;
  if (!seg || !Array.isArray(caminho) || caminho.length > 80 || !caminho.every((c) => typeof c === "string" && PERGUNTA_POR_ID.has(c))) return null;
  if (!respostas || typeof respostas !== "object") return null;
  const txt = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
  const out: Respostas = {};
  for (const [id, r] of Object.entries(respostas as Record<string, Record<string, unknown>>)) {
    if (!PERGUNTA_POR_ID.has(id) || !r || typeof r !== "object") continue;
    out[id] = JSON.parse(
      JSON.stringify({
        v: Array.isArray(r.v) ? r.v.filter((x): x is string => typeof x === "string").slice(0, 20) : undefined,
        texto: txt(r.texto, 600),
        data: txt(r.data, 10),
        hora: txt(r.hora, 5),
        obs: txt(r.obs, 600),
        nome: txt(r.nome, 120),
        telefone: txt(r.telefone, 25),
        lembrar: txt(r.lembrar, 10),
        ficha: id === "R1" && r.ficha ? limparFicha(r.ficha) : undefined
      })
    );
  }
  return { segmento: seg, caminho: caminho as string[], respostas: out };
}

export async function salvarAtendimento(
  ator: Ator,
  clienteId: string,
  d: { id?: string | null; segmento: string; caminho: string[]; respostas: Respostas }
): Promise<Resp<{ id: string }>> {
  if (!(await clienteDoAtor(ator, clienteId))) return { ok: false, erro: "Cliente não encontrado." };
  const dados = limparDados(d.segmento, d.caminho, d.respostas);
  if (!dados) return { ok: false, erro: "Não foi possível salvar o roteiro. Atualize a página." };

  // um atendimento em andamento por cliente: reaproveita o aberto (mesmo que outra pessoa tenha começado)
  const aberto = await prisma.crm_atendimentos.findFirst({ where: { cliente_id: clienteId, status: "em_andamento" }, select: { id: true } });
  if (d.id && aberto?.id !== d.id) return { ok: false, erro: "Este atendimento já foi concluído ou descartado. Atualize a página." };
  const campos = { segmento: dados.segmento, caminho: dados.caminho, respostas: dados.respostas as object, updated_at: new Date() };
  if (aberto) {
    await prisma.crm_atendimentos.update({ where: { id: aberto.id }, data: campos });
    return { ok: true, id: aberto.id };
  }
  const novo = await prisma.crm_atendimentos.create({ data: { ...campos, cliente_id: clienteId, versao_roteiro: VERSAO_ROTEIRO, por_parceiro_id: ator.parceiroId }, select: { id: true } });
  return { ok: true, id: novo.id };
}

export async function descartarAtendimento(ator: Ator, clienteId: string, atendimentoId: string): Promise<Resp<object>> {
  if (!(await clienteDoAtor(ator, clienteId))) return { ok: false, erro: "Cliente não encontrado." };
  await prisma.crm_atendimentos.updateMany({ where: { id: atendimentoId, cliente_id: clienteId, status: "em_andamento" }, data: { status: "cancelado", updated_at: new Date() } });
  await registrarLog(ator, clienteId, "descartar_atendimento_cliente", {});
  return { ok: true };
}

export type ProximaEscolhida = { tipo: string; titulo: string; data: string; hora?: string | null; responsavelId?: string | null };

export type Conclusao = {
  crm: CrmCliente;
  atividades: AtividadeCliente[];
  contatos: ContatoRegistrado[];
  atendimentos: AtendimentosDoCliente;
  ficha: FichaDoCliente;
  modelo: string | null;
  feito: string[]; // o que o sistema fez, para mostrar a quem atendeu
};

const dataDb = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export async function concluirAtendimento(
  ator: Ator,
  clienteId: string,
  d: { id?: string | null; segmento: string; caminho: string[]; respostas: Respostas; proxima: ProximaEscolhida | null }
): Promise<Resp<Conclusao>> {
  if (!(await clienteDoAtor(ator, clienteId))) return { ok: false, erro: "Cliente não encontrado." };
  const dados = limparDados(d.segmento, d.caminho, d.respostas);
  if (!dados) return { ok: false, erro: "Atendimento inválido. Atualize a página." };
  const hoje = hojeInputDate();
  // o roteiro em vigor: o original com as edições do administrativo
  const motor = criarMotor(aplicarEdicoes(await carregarEdicoes()));
  const erro = motor.validarAtendimento(dados.segmento, dados.caminho, dados.respostas, hoje);
  if (erro) return { ok: false, erro };

  const cliente = await prisma.clientes.findUnique({
    where: { id: clienteId },
    select: { id: true, nome: true, parceiro_id: true, loja_id: true, id_legado: true, atendimento_desde: true, parceiros: { select: { id: true, nome: true, status_funcao: true } } }
  });
  if (!cliente) return { ok: false, erro: "Cliente não encontrado." };

  // da ficha, só vale o que ficou marcado em "O que você descobriu"
  const r1 = dados.respostas.R1;
  const descobertas = dados.caminho.includes("R1") ? (r1?.v ?? []) : [];
  const fichaNova: FichaDados = {};
  for (const c of CAMPOS_FICHA) if (descobertas.includes(c.descoberta) && r1?.ficha?.[c.id]) fichaNova[c.id] = r1.ficha[c.id];
  if (r1) dados.respostas.R1 = { ...r1, ficha: Object.keys(fichaNova).length ? fichaNova : undefined };

  const ctx = motor.contextoDe(dados.segmento, dados.caminho, dados.respostas);
  const tentativas = await contarTentativas(clienteId);
  const desfecho = desfechoFinal(ctx, tentativas);
  const optOut = temOptOut(ctx);
  const temperatura = motor.temperaturaFinal(ctx, desfecho, dados.caminho, dados.respostas, hoje);

  // Regra: próxima atividade com data é obrigatória, menos no "não quer" com opt-out.
  const proxima = optOut ? null : d.proxima;
  if (!optOut) {
    if (!proxima || !TIPOS_ATIVIDADE_CRM.includes(proxima.tipo) || !proxima.titulo.trim()) return { ok: false, erro: "Defina a próxima atividade antes de concluir." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(proxima.data) || proxima.data < hoje) return { ok: false, erro: "A próxima atividade precisa de uma data (hoje ou futura)." };
  }

  const resumo = motor.textoDoResumo(desfecho, dados.caminho, dados.respostas);
  const corretor = cliente.parceiros && cliente.parceiros.status_funcao === "Ativo" ? cliente.parceiros : null;
  // responsável padrão: o corretor do cliente; o corretor no portal sempre é ele mesmo
  let responsavel = ator.portal ? ator.parceiroId : (proxima?.responsavelId ?? corretor?.id ?? ator.parceiroId);
  if (!ator.portal) {
    const ok = await prisma.parceiros.findFirst({ where: { id: responsavel, status_funcao: "Ativo", funcao: { in: ["Administrativo", "Corretor", "Corretor Estagiário"] } }, select: { id: true } });
    if (!ok) responsavel = ator.parceiroId;
  }

  // 1) fecha o atendimento (só um clique vence: quem concluir primeiro)
  let atendimentoId = d.id ?? null;
  if (!atendimentoId) {
    const salvo = await salvarAtendimento(ator, clienteId, { segmento: dados.segmento, caminho: dados.caminho, respostas: dados.respostas });
    if (!salvo.ok) return salvo;
    atendimentoId = salvo.id;
  }
  const fechado = await prisma.crm_atendimentos.updateMany({
    where: { id: atendimentoId, cliente_id: clienteId, status: "em_andamento" },
    data: {
      status: "concluido",
      segmento: ctx.segmento,
      caminho: dados.caminho,
      respostas: dados.respostas as object,
      desfecho,
      temperatura,
      resumo,
      por_parceiro_id: ator.parceiroId,
      updated_at: new Date(),
      concluido_em: new Date()
    }
  });
  if (fechado.count !== 1) return { ok: false, erro: "Este atendimento já foi concluído. Atualize a página." };

  const feito: string[] = [];
  const contatos: ContatoRegistrado[] = [];

  // 2) registro em "Contatos e notas"
  const contato = await prisma.clientes_contatos.create({
    data: { cliente_id: clienteId, tipo: "Roteiro de atendimento", resultado: DESFECHOS[desfecho].rotulo, nota: resumo.slice(0, 4000), por_parceiro_id: ator.parceiroId }
  });
  contatos.push({ id: contato.id, tipo: contato.tipo, resultado: contato.resultado, nota: contato.nota, data: contato.data.toISOString(), por: ator.nome });
  feito.push("Atendimento registrado em Contatos e notas.");

  // 3) estado do relacionamento
  const motivoOpt = motor.mapa.get("D_NQ_MOTIVO")?.opcoes?.find((o) => dados.respostas.D_NQ_MOTIVO?.v?.includes(o.id))?.rotulo ?? "Pediu para não receber novidades";
  const estado = {
    ...(temperatura ? { temperatura } : {}),
    ...(ctx.telefoneInvalido ? { telefone_invalido: true } : {}),
    ...(optOut ? { opt_out: true, opt_out_em: new Date(), opt_out_motivo: `Roteiro de atendimento: ${motivoOpt}`, temperatura: "nao_quer" } : {}),
    updated_at: new Date(),
    updated_by: ator.parceiroId
  };
  await prisma.crm_clientes.upsert({ where: { cliente_id: clienteId }, create: { cliente_id: clienteId, ...estado }, update: estado });
  if (optOut) {
    feito.push("Opt-out registrado: contatos de marketing bloqueados.");
    const encerrados = await encerrarLembretesDeMarketing(clienteId, ator.parceiroId);
    if (encerrados > 0) feito.push(`Lembretes de relacionamento em aberto cancelados: ${encerrados}.`);
  }

  const criarAtividade = (a: { cliente?: string; tipo: string; titulo: string; data: string; hora?: string | null; responsavelId: string; contatoId?: string | null }) =>
    prisma.clientes_atividades.create({
      data: {
        cliente_id: a.cliente ?? clienteId,
        contato_id: a.contatoId ?? null,
        tipo: a.tipo,
        titulo: a.titulo.trim().slice(0, 200),
        data: dataDb(a.data),
        hora: a.hora && /^\d{2}:\d{2}$/.test(a.hora) ? a.hora : null,
        responsavel_id: a.responsavelId,
        origem: "roteiro",
        criado_por: ator.parceiroId
      }
    });

  // 4) próxima atividade
  if (proxima) {
    await criarAtividade({ tipo: proxima.tipo, titulo: proxima.titulo, data: proxima.data, hora: proxima.hora, responsavelId: responsavel, contatoId: contato.id });
    feito.push(`Próxima atividade agendada para ${proxima.data.split("-").reverse().join("/")}.`);
  }

  // 5) lead quente: o corretor sabe na hora e ganha "Ligar" para hoje
  if (desfecho === "quer") {
    if (corretor && corretor.id !== ator.parceiroId) {
      const jaTem = proxima && proxima.tipo === "Ligar" && proxima.data === hoje && responsavel === corretor.id;
      if (!jaTem) await criarAtividade({ tipo: "Ligar", titulo: `Ligar para o cliente (lead quente) — ${cliente.nome}`, data: hoje, responsavelId: corretor.id, contatoId: contato.id });
      await registrarAviso({ tipo: "lead_quente", parceiroId: ator.parceiroId, paraParceiroId: corretor.id, detalhe: `${cliente.nome} — ${motor.mapa.get("D_QUER")?.opcoes?.find((o) => dados.respostas.D_QUER?.v?.includes(o.id))?.rotulo ?? "quer seguir"}`, url: `/portal/clientes/${clienteId}` });
      feito.push(`${corretor.nome.split(" ")[0]} foi avisado e tem “Ligar” para hoje.`);
    } else if (!corretor) {
      await registrarAviso({ tipo: "lead_quente_sem_corretor", parceiroId: ator.parceiroId, detalhe: cliente.nome, url: `/clientes/${clienteId}/etiqueta` });
      await criarAtividade({ tipo: "Outro", titulo: `Lead quente SEM corretor: transferir — ${cliente.nome}`, data: hoje, responsavelId: ator.parceiroId, contatoId: contato.id });
      feito.push("Cliente sem corretor ativo: criei a atividade de transferência para hoje e avisei a equipe.");
    }
  }

  // 6) assuntos para o administrativo
  for (const assunto of ctx.adm) {
    await registrarAviso({ tipo: "atencao_adm", parceiroId: ator.parceiroId, detalhe: `${assunto} — ${cliente.nome}`, url: `/clientes/${clienteId}/etiqueta` });
    if (!ator.portal) await criarAtividade({ tipo: "Outro", titulo: `${assunto} — ${cliente.nome}`, data: hoje, responsavelId: ator.parceiroId, contatoId: contato.id });
    feito.push(`Administrativo avisado: ${assunto}.`);
  }

  // 7) ficha de relacionamento e gancho de conversa (com "lembrar em" vira atividade; no opt-out, sem lembrete)
  if (await gravarFicha(ator, clienteId, fichaNova, false)) feito.push("Ficha de relacionamento atualizada.");
  const gancho = dados.respostas.R2;
  if (dados.caminho.includes("R2") && gancho?.texto?.trim()) {
    const lembrar = !optOut && gancho.lembrar && gancho.lembrar >= hoje ? gancho.lembrar : null;
    await criarGancho({
      clienteId,
      nomeCliente: cliente.nome,
      texto: gancho.texto,
      lembrarEm: lembrar,
      responsavelId: ator.portal ? ator.parceiroId : (corretor?.id ?? ator.parceiroId),
      autorId: ator.parceiroId,
      atendimentoContatoId: contato.id
    });
    feito.push(lembrar ? `Gancho guardado, com lembrete em ${lembrar.split("-").reverse().join("/")}.` : "Gancho guardado na ficha.");
  }

  // 8) indicação: vira um lead novo, ligado a quem indicou
  const ind = dados.respostas.IND;
  if (dados.caminho.includes("IND") && ind?.v?.includes("indicou") && ind.nome && ind.telefone) {
    const nome = ind.nome.trim();
    const telefone = ind.telefone.replace(/\D/g, "");
    const existente = await prisma.$queryRaw<{ id: string; nome: string; id_legado: string | null }[]>`
      select id, nome, id_legado from clientes where regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g') = ${telefone} limit 1`;
    if (existente.length > 0) {
      feito.push(`Indicação já cadastrada: ${existente[0].nome} (${existente[0].id_legado ?? "sem código"}). Não criei outro cadastro.`);
      await prisma.clientes_contatos.create({ data: { cliente_id: existente[0].id, tipo: "Nota", resultado: "Indicação", nota: `Indicado(a) por ${cliente.nome} (${cliente.id_legado ?? ""})`, por_parceiro_id: ator.parceiroId } });
    } else {
      const donoNovo = corretor?.id ?? null;
      const novo = await prisma.clientes.create({
        data: { id_legado: await gerarProximoIdCliente(), nome, telefone, tipo_cliente: "Pessoa Física", parceiro_id: donoNovo, loja_id: cliente.loja_id },
        select: { id: true, id_legado: true }
      });
      await prisma.crm_clientes.create({ data: { cliente_id: novo.id, indicado_por_cliente_id: clienteId, fonte_dado: `Indicação de ${cliente.nome}`, updated_by: ator.parceiroId } });
      await prisma.clientes_contatos.create({ data: { cliente_id: novo.id, tipo: "Nota", resultado: "Indicação", nota: `Indicado(a) por ${cliente.nome} (${cliente.id_legado ?? ""})`, por_parceiro_id: ator.parceiroId } });
      await criarAtividade({ cliente: novo.id, tipo: "Ligar", titulo: `Primeiro contato (indicação de ${cliente.nome.split(" ")[0]}) — ${nome}`, data: somarDias(hoje, 1), responsavelId: donoNovo ?? ator.parceiroId });
      feito.push(`Indicado cadastrado como lead (${novo.id_legado}) com “Ligar” para amanhã.`);
    }
    const notaIndicou = await prisma.clientes_contatos.create({ data: { cliente_id: clienteId, tipo: "Nota", resultado: "Indicação", nota: `Indicou ${nome}`, por_parceiro_id: ator.parceiroId } });
    contatos.unshift({ id: notaIndicou.id, tipo: notaIndicou.tipo, resultado: notaIndicou.resultado, nota: notaIndicou.nota, data: notaIndicou.data.toISOString(), por: ator.nome });
  }

  // 9) quadro de Clientes: quem quer (ou quer depois) fica "Em atendimento"; quem não quer sai
  if ((desfecho === "quer" || desfecho === "futuro") && !cliente.atendimento_desde) {
    await prisma.clientes.update({ where: { id: clienteId }, data: { atendimento_desde: new Date(), atendimento_por: ator.parceiroId } });
  } else if (desfecho === "nao_quer" && cliente.atendimento_desde) {
    await prisma.clientes.update({ where: { id: clienteId }, data: { atendimento_desde: null, atendimento_por: null } });
  }

  await limparRepasse(ator, clienteId);
  await registrarLog(ator, clienteId, "concluir_atendimento_cliente", { desfecho, temperatura, segmento: ctx.segmento });
  revalidatePath(ator.portal ? `/portal/clientes/${clienteId}` : `/clientes/${clienteId}/etiqueta`);
  revalidatePath(ator.portal ? "/portal/clientes" : "/clientes/funil");

  const [{ crm, atividades }, atendimentos, ficha] = await Promise.all([carregarCrmDoCliente(clienteId), carregarAtendimentos(clienteId), carregarFicha(clienteId)]);
  return { ok: true, crm, atividades, contatos, atendimentos, ficha, modelo: ctx.modelo, feito };
}
