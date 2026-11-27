import { prisma } from "@/lib/prisma";
import { hojeInputDate } from "@/lib/format";
import { CAMPOS_FICHA, limparFicha, type FichaDados, type FichaDoCliente, type Gancho } from "@/lib/crm/ficha";
import { casasDosClientes } from "@/lib/crm/casa-servidor";
import { carregarCrmDoCliente, clienteDoAtor, limparRepasse, registrarLog, type Ator } from "@/lib/crm/servidor";
import type { AtividadeCliente } from "@/lib/crm/atividades";

// Ficha de relacionamento e ganchos de conversa. Quem acessa: o administrativo (inclui a assistente) e o corretor
// responsável pelo cliente (clienteDoAtor confere).

type Resp<T> = ({ ok: true } & T) | { ok: false; erro: string };
export type RespostaFicha = Resp<{ ficha: FichaDoCliente; atividades: AtividadeCliente[] }>;

const dataDb = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const dia = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export async function carregarFicha(clienteId: string): Promise<FichaDoCliente> {
  const [cliente, ficha, ganchos, casas] = await Promise.all([
    prisma.clientes.findUnique({ where: { id: clienteId }, select: { data_nascimento: true, estado_civil: true, clientes: { select: { nome: true } } } }),
    prisma.crm_fichas.findUnique({ where: { cliente_id: clienteId } }),
    prisma.crm_ganchos.findMany({ where: { cliente_id: clienteId }, orderBy: { created_at: "desc" }, take: 60 }),
    casasDosClientes([clienteId])
  ]);
  const ids = [...new Set(ganchos.map((g) => g.por_parceiro_id).filter((x): x is string => !!x))];
  const nomes = new Map((await prisma.parceiros.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })).map((p) => [p.id, p.nome]));
  const dados: FichaDados = limparFicha(ficha?.dados);
  if (ficha?.casamento_em) dados.casamento = dia(ficha.casamento_em)!;
  if (ficha?.casa_em) dados.casa = dia(ficha.casa_em)!;
  return {
    dados,
    ganchos: ganchos.map((g): Gancho => ({ id: g.id, texto: g.texto, lembrarEm: dia(g.lembrar_em), criadoEm: g.created_at.toISOString(), por: g.por_parceiro_id ? (nomes.get(g.por_parceiro_id) ?? null) : null })),
    estadoCivil: cliente?.estado_civil ?? null,
    conjugeCadastro: cliente?.clientes?.nome ?? null,
    nascimentoCadastro: dia(cliente?.data_nascimento),
    casaContrato: casas[0] ? { data: casas[0].data, tipo: casas[0].tipo } : null
  };
}

// Grava os campos. `substituir` = a tela da ficha (o que ficou em branco é apagado); sem ele (roteiro), só entra o que
// veio preenchido. A data de nascimento vai para o cadastro do cliente, e só quando ele ainda não tem.
export async function gravarFicha(ator: Ator, clienteId: string, entrada: unknown, substituir: boolean): Promise<boolean> {
  const limpa = limparFicha(entrada);
  const { nascimento, casamento, casa, ...resto } = limpa;
  const atual = await prisma.crm_fichas.findUnique({ where: { cliente_id: clienteId } });
  const dados = substituir ? resto : { ...limparFicha(atual?.dados), ...resto };
  delete dados.nascimento;
  delete dados.casamento;
  delete dados.casa;
  const datas = {
    casamento_em: typeof casamento === "string" ? dataDb(casamento) : substituir ? null : (atual?.casamento_em ?? null),
    casa_em: typeof casa === "string" ? dataDb(casa) : substituir ? null : (atual?.casa_em ?? null)
  };
  let mudou = false;
  if (substituir || Object.keys(resto).length > 0 || casamento || casa) {
    const campos = { dados: dados as object, ...datas, updated_at: new Date(), updated_by: ator.parceiroId };
    await prisma.crm_fichas.upsert({ where: { cliente_id: clienteId }, create: { cliente_id: clienteId, ...campos }, update: campos });
    mudou = true;
  }
  if (typeof nascimento === "string" && nascimento <= hojeInputDate()) {
    const r = await prisma.clientes.updateMany({ where: { id: clienteId, data_nascimento: null }, data: { data_nascimento: dataDb(nascimento), updated_at: new Date() } });
    if (r.count > 0) mudou = true;
  }
  return mudou;
}

async function resposta(ator: Ator, clienteId: string): Promise<RespostaFicha> {
  const [ficha, { atividades }] = await Promise.all([carregarFicha(clienteId), carregarCrmDoCliente(clienteId)]);
  return { ok: true, ficha, atividades };
}

export async function salvarFicha(ator: Ator, clienteId: string, dados: FichaDados): Promise<RespostaFicha> {
  if (!(await clienteDoAtor(ator, clienteId))) return { ok: false, erro: "Cliente não encontrado." };
  await gravarFicha(ator, clienteId, dados, true);
  await limparRepasse(ator, clienteId);
  // no log vão só os nomes dos campos preenchidos, não o conteúdo
  await registrarLog(ator, clienteId, "salvar_ficha_relacionamento", { campos: CAMPOS_FICHA.filter((c) => limparFicha(dados)[c.id]).map((c) => c.id) });
  return resposta(ator, clienteId);
}

// Cria o gancho e, se tiver "lembrar em", a atividade que avisa no dia.
export async function criarGancho(d: {
  clienteId: string;
  nomeCliente: string;
  texto: string;
  lembrarEm: string | null;
  responsavelId: string;
  autorId: string;
  atendimentoContatoId?: string | null;
}): Promise<void> {
  const texto = d.texto.trim().slice(0, 200);
  if (!texto) return;
  const atividade = d.lembrarEm
    ? await prisma.clientes_atividades.create({
        data: {
          cliente_id: d.clienteId,
          contato_id: d.atendimentoContatoId ?? null,
          tipo: "Outro",
          titulo: `Lembrar: ${texto} — ${d.nomeCliente}`.slice(0, 200),
          data: dataDb(d.lembrarEm),
          responsavel_id: d.responsavelId,
          origem: "roteiro",
          criado_por: d.autorId
        },
        select: { id: true }
      })
    : null;
  await prisma.crm_ganchos.create({
    data: { cliente_id: d.clienteId, texto, lembrar_em: d.lembrarEm ? dataDb(d.lembrarEm) : null, atividade_id: atividade?.id ?? null, por_parceiro_id: d.autorId }
  });
}

export async function adicionarGancho(ator: Ator, clienteId: string, texto: string, lembrarEm: string | null): Promise<RespostaFicha> {
  const cliente = await clienteDoAtor(ator, clienteId);
  if (!cliente) return { ok: false, erro: "Cliente não encontrado." };
  if (!texto.trim()) return { ok: false, erro: "Escreva o gancho." };
  if (lembrarEm && (!/^\d{4}-\d{2}-\d{2}$/.test(lembrarEm) || lembrarEm < hojeInputDate())) return { ok: false, erro: "A data para lembrar precisa ser hoje ou futura." };
  const optOut = (await prisma.crm_clientes.findUnique({ where: { cliente_id: clienteId }, select: { opt_out: true } }))?.opt_out;
  if (optOut && lembrarEm) return { ok: false, erro: "Este cliente pediu para não receber contatos: registre o gancho sem “lembrar em”." };
  // o lembrete fica com o corretor do cliente (se estiver ativo); no portal, com o próprio corretor
  let responsavelId = ator.parceiroId;
  if (!ator.portal && cliente.parceiro_id) {
    const ativo = await prisma.parceiros.findFirst({ where: { id: cliente.parceiro_id, status_funcao: "Ativo" }, select: { id: true } });
    if (ativo) responsavelId = ativo.id;
  }
  await criarGancho({ clienteId, nomeCliente: cliente.nome, texto, lembrarEm, responsavelId, autorId: ator.parceiroId });
  await limparRepasse(ator, clienteId);
  await registrarLog(ator, clienteId, "adicionar_gancho_cliente", { lembrar: lembrarEm });
  return resposta(ator, clienteId);
}

export async function removerGancho(ator: Ator, ganchoId: string): Promise<RespostaFicha> {
  const g = await prisma.crm_ganchos.findUnique({ where: { id: ganchoId } });
  if (!g || !(await clienteDoAtor(ator, g.cliente_id))) return { ok: false, erro: "Gancho não encontrado." };
  await prisma.crm_ganchos.delete({ where: { id: g.id } });
  // o lembrete ainda não feito sai junto
  if (g.atividade_id) await prisma.clientes_atividades.deleteMany({ where: { id: g.atividade_id, feito: false } });
  await registrarLog(ator, g.cliente_id, "remover_gancho_cliente", {});
  return resposta(ator, g.cliente_id);
}
