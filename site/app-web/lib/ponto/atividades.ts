import { prisma } from "@/lib/prisma";
import { labelColuna as colunaMarketing } from "@/lib/marketing/opcoes";
import { labelColuna as colunaGestao } from "@/lib/gestoes/opcoes";
import { COLUNAS_KANBAN as COLUNAS_MANUTENCAO } from "@/lib/manutencao/opcoes";
import { intervalosDoParceiro } from "@/lib/ponto/servidor";
import { emExpediente, noAlmoco, type PontoConfig } from "@/lib/ponto/regras";

// Relatório de atividades de quem tem o ponto controlado: o que a pessoa fez no sistema no período
// (moveu etiqueta, editou cliente ou parceiro, gerou documento...). Vem dos registros que o sistema já
// grava a cada alteração (logs_alteracao) mais os contatos de clientes, as etapas do Financiamento e
// os contatos do Recrutamento. Só entram ações que MUDAM algo: abrir uma tela não deixa registro.

export type AtividadeRelatorio = {
  id: string;
  quando: Date;
  categoria: string;
  titulo: string;
  href: string | null;
  // cruzamento com o ponto
  fora: boolean; // fora do expediente
  almoco: boolean; // no horário de almoço
  semPonto: boolean; // sem nenhum período de uso registrado naquele momento
};

export const CATEGORIAS_ATIVIDADE = ["Clientes", "Parceiros", "Imóveis", "Contratos", "Administração", "Marketing", "Manutenção", "Gestão", "Financiamento", "Financeiro", "Documentos", "Recrutamento", "Site e eventos", "E-mails", "Outros"] as const;

const LIMITE = 500;

type Cat = (typeof CATEGORIAS_ATIVIDADE)[number];
const POR_ENTIDADE: Record<string, { cat: Cat; rotulo: string; href?: (id: string) => string }> = {
  clientes: { cat: "Clientes", rotulo: "cliente", href: (id) => `/clientes/${id}` },
  parceiros: { cat: "Parceiros", rotulo: "parceiro", href: (id) => `/parceiros/${id}` },
  imoveis: { cat: "Imóveis", rotulo: "imóvel", href: (id) => `/imoveis/${id}` },
  transacoes: { cat: "Contratos", rotulo: "transação", href: (id) => `/transacoes/${id}` },
  pagamentos: { cat: "Contratos", rotulo: "pagamento" },
  adm_imoveis: { cat: "Administração", rotulo: "administração", href: (id) => `/administracoes/${id}` },
  marketing_ordens: { cat: "Marketing", rotulo: "ordem de marketing", href: (id) => `/marketing/${id}` },
  solicitacoes_agenda: { cat: "Marketing", rotulo: "solicitação de agenda" },
  manutencoes: { cat: "Manutenção", rotulo: "ticket de manutenção", href: (id) => `/manutencao/${id}/etiqueta` },
  gestoes: { cat: "Gestão", rotulo: "gestão", href: (id) => `/gestoes/${id}` },
  avaliacoes: { cat: "Financiamento", rotulo: "avaliação", href: (id) => `/financiamento/${id}/etiqueta` },
  andamentos: { cat: "Financiamento", rotulo: "andamento" },
  movimentacoes: { cat: "Financeiro", rotulo: "movimentação financeira" },
  documentos_gerados: { cat: "Documentos", rotulo: "documento" },
  publicacoes_site: { cat: "Site e eventos", rotulo: "publicação" },
  eventos: { cat: "Site e eventos", rotulo: "evento", href: (id) => `/eventos/${id}` },
  mensagens_sac: { cat: "Site e eventos", rotulo: "mensagem do SAC" },
  disparos_email: { cat: "E-mails", rotulo: "disparo de e-mail" }
};

const CAMPOS: Record<string, string> = {
  nome: "nome",
  telefone: "telefone",
  email: "e-mail",
  cpf: "CPF",
  cnpj: "CNPJ",
  rg: "RG",
  endereco: "endereço",
  status: "status",
  coluna: "etapa",
  titulo: "título",
  funcao: "função",
  status_funcao: "situação",
  valor_transacao: "valor",
  observacao: "observação",
  loja_id: "loja",
  parceiro_id: "corretor responsável",
  banco_id: "banco",
  renda_bruta: "renda",
  data_nascimento: "data de nascimento",
  estado_civil: "estado civil",
  cep: "CEP",
  rua: "rua",
  bairro: "bairro",
  data_vencimento: "vencimento",
  data_assinatura: "data de assinatura",
  andamento: "andamento",
  urgencia: "urgência",
  prestador_id: "prestador",
  tipo_servico: "tipo de serviço"
};
const IGNORAR = new Set(["updated_at", "created_at", "id", "atualizado_em", "criado_em", "senha_hash"]);

const humanizar = (s: string) => s.replace(/_/g, " ").trim();

// Documentos gerados (acao "gerar_...") com o nome por extenso
const DOCUMENTOS: Record<string, string> = {
  contrato_locacao: "contrato de locação",
  contrato_locacao_sem_administracao: "contrato de locação sem administração",
  contrato_administracao: "contrato de administração",
  contrato_compra_venda: "contrato de compra e venda",
  contrato_gestao: "contrato de gestão",
  contrato_associacao_corretor: "contrato de associação de corretor",
  contrato_associacao_corretor_estagiario: "contrato de associação de corretor estagiário",
  proposta_compra_venda: "proposta de compra e venda",
  locacao: "locação",
  compra_venda: "compra e venda"
};

// Ações com frase própria (o resto cai no texto genérico)
const ACOES: Record<string, string> = {
  adicionar_socio: "Adicionou sócio a",
  salvar_acessos: "Alterou os acessos de",
  definir_senha_manual: "Definiu a senha de",
  conceder_acesso_completo: "Concedeu acesso completo a",
  remover_acesso_completo: "Removeu o acesso completo de",
  atualizar_status: "Atualizou o status de",
  criar_disparo_email: "Criou o",
  concluir_disparo_email: "Concluiu o",
  enviar_imagem_consulta_corretor: "Enviou imagem de consulta na",
  solicitar_liberacao_ponto: "Pediu liberação de horas",
  aprovar_liberacao_ponto: "Aprovou liberação de horas de",
  negar_liberacao_ponto: "Negou liberação de horas de",
  ajuste_manual_ponto: "Lançou período manual no ponto de",
  anular_periodo_ponto: "Anulou período no ponto de"
};

type Json = Record<string, unknown> | null;
const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function camposAlterados(antes: Json, depois: Json): string[] {
  if (!antes || !depois) return [];
  const chaves = new Set([...Object.keys(antes), ...Object.keys(depois)]);
  const mudou: string[] = [];
  for (const k of chaves) {
    if (IGNORAR.has(k)) continue;
    if (JSON.stringify(antes[k] ?? null) !== JSON.stringify(depois[k] ?? null)) mudou.push(CAMPOS[k] ?? humanizar(k));
  }
  return mudou;
}

function rotuloEtapa(entidade: string, valor: unknown): string {
  const v = String(valor ?? "");
  if (entidade === "marketing_ordens") return colunaMarketing(v);
  if (entidade === "gestoes") return colunaGestao(v);
  if (entidade === "manutencoes") return COLUNAS_MANUTENCAO.find((c) => c.id === v)?.label ?? humanizar(v);
  return humanizar(v);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Nome de cada registro tocado (cliente, parceiro, ordem...), em poucas consultas.
async function nomesDasEntidades(porTipo: Map<string, Set<string>>): Promise<Map<string, string>> {
  const nomes = new Map<string, string>();
  const ids = (t: string) => [...(porTipo.get(t) ?? [])];
  const guardar = (t: string, id: string, nome: string | null | undefined) => {
    if (nome) nomes.set(`${t}:${id}`, nome.length > 70 ? `${nome.slice(0, 67)}...` : nome);
  };
  await Promise.all([
    ids("clientes").length ? prisma.clientes.findMany({ where: { id: { in: ids("clientes") } }, select: { id: true, nome: true } }).then((r) => r.forEach((x) => guardar("clientes", x.id, x.nome))) : null,
    ids("parceiros").length ? prisma.parceiros.findMany({ where: { id: { in: ids("parceiros") } }, select: { id: true, nome: true } }).then((r) => r.forEach((x) => guardar("parceiros", x.id, x.nome))) : null,
    ids("imoveis").length ? prisma.imoveis.findMany({ where: { id: { in: ids("imoveis") } }, select: { id: true, endereco: true, id_legado: true } }).then((r) => r.forEach((x) => guardar("imoveis", x.id, x.endereco ?? x.id_legado))) : null,
    ids("transacoes").length ? prisma.transacoes.findMany({ where: { id: { in: ids("transacoes") } }, select: { id: true, tipo: true, id_legado: true } }).then((r) => r.forEach((x) => guardar("transacoes", x.id, `${x.tipo} ${x.id_legado ?? ""}`.trim()))) : null,
    ids("marketing_ordens").length ? prisma.marketing_ordens.findMany({ where: { id: { in: ids("marketing_ordens") } }, select: { id: true, titulo: true } }).then((r) => r.forEach((x) => guardar("marketing_ordens", x.id, x.titulo))) : null,
    ids("manutencoes").length ? prisma.manutencoes.findMany({ where: { id: { in: ids("manutencoes") } }, select: { id: true, titulo: true } }).then((r) => r.forEach((x) => guardar("manutencoes", x.id, x.titulo))) : null,
    ids("gestoes").length ? prisma.gestoes.findMany({ where: { id: { in: ids("gestoes") } }, select: { id: true, id_legado: true, clientes: { select: { nome: true } } } }).then((r) => r.forEach((x) => guardar("gestoes", x.id, `${x.id_legado ?? "gestão"}${x.clientes?.nome ? ` · ${x.clientes.nome}` : ""}`))) : null,
    ids("avaliacoes").length ? prisma.avaliacoes.findMany({ where: { id: { in: ids("avaliacoes") } }, select: { id: true, id_legado: true, clientes: { select: { nome: true } } } }).then((r) => r.forEach((x) => guardar("avaliacoes", x.id, `${x.id_legado ?? "avaliação"}${x.clientes?.nome ? ` · ${x.clientes.nome}` : ""}`))) : null,
    ids("adm_imoveis").length ? prisma.adm_imoveis.findMany({ where: { id: { in: ids("adm_imoveis") } }, select: { id: true, id_legado: true, clientes: { select: { nome: true } } } }).then((r) => r.forEach((x) => guardar("adm_imoveis", x.id, `${x.id_legado ?? "administração"}${x.clientes?.nome ? ` · ${x.clientes.nome}` : ""}`))) : null,
    ids("publicacoes_site").length ? prisma.publicacoes_site.findMany({ where: { id: { in: ids("publicacoes_site") } }, select: { id: true, titulo: true } }).then((r) => r.forEach((x) => guardar("publicacoes_site", x.id, x.titulo))) : null,
    ids("movimentacoes").length ? prisma.movimentacoes.findMany({ where: { id: { in: ids("movimentacoes") } }, select: { id: true, descricao: true, id_legado: true } }).then((r) => r.forEach((x) => guardar("movimentacoes", x.id, x.descricao ?? x.id_legado))) : null,
    ids("solicitacoes_agenda").length ? prisma.solicitacoes_agenda.findMany({ where: { id: { in: ids("solicitacoes_agenda") } }, select: { id: true, titulo: true } }).then((r) => r.forEach((x) => guardar("solicitacoes_agenda", x.id, x.titulo))) : null,
    ids("eventos").length ? prisma.eventos.findMany({ where: { id: { in: ids("eventos") } }, select: { id: true, nome: true } }).then((r) => r.forEach((x) => guardar("eventos", x.id, x.nome))) : null,
    ids("disparos_email").length ? prisma.disparos_email.findMany({ where: { id: { in: ids("disparos_email") } }, select: { id: true, assunto: true } }).then((r) => r.forEach((x) => guardar("disparos_email", x.id, x.assunto))) : null
  ]);
  return nomes;
}

export async function atividadesDoPeriodo(parceiroId: string, cfg: PontoConfig, de: Date, ate: Date): Promise<{ itens: AtividadeRelatorio[]; truncado: boolean }> {
  const [logs, contatos, fin, recr, intervalos] = await Promise.all([
    prisma.logs_alteracao.findMany({ where: { parceiro_id: parceiroId, criado_em: { gte: de, lt: ate } }, orderBy: { criado_em: "desc" }, take: LIMITE + 1 }),
    prisma.clientes_contatos.findMany({ where: { por_parceiro_id: parceiroId, data: { gte: de, lt: ate } }, orderBy: { data: "desc" }, take: LIMITE + 1 }),
    prisma.financiamento_atividades.findMany({ where: { por_parceiro_id: parceiroId, inicio: { gte: de, lt: ate } }, orderBy: { inicio: "desc" }, take: LIMITE + 1 }),
    prisma.recrutamento_atividades.findMany({ where: { por_parceiro_id: parceiroId, data: { gte: de, lt: ate } }, orderBy: { data: "desc" }, take: LIMITE + 1 }),
    intervalosDoParceiro(parceiroId, new Date(de.getTime() - 3600_000), ate)
  ]);

  // quais registros precisam de nome
  const porTipo = new Map<string, Set<string>>();
  const quero = (tipo: string, id: string | null | undefined) => {
    if (!id) return;
    if (!porTipo.has(tipo)) porTipo.set(tipo, new Set());
    porTipo.get(tipo)!.add(id);
  };
  for (const l of logs) quero(l.entidade_tipo, l.entidade_id);
  for (const c of contatos) quero("clientes", c.cliente_id);
  for (const f of fin) quero("avaliacoes", f.avaliacao_id);
  const recrutados = await prisma.parceiros.findMany({ where: { id: { in: [...new Set(recr.map((r) => r.parceiro_id))] } }, select: { id: true, nome: true } });
  const nomeRecrutado = new Map(recrutados.map((p) => [p.id, p.nome]));
  const nomes = await nomesDasEntidades(porTipo);

  const itens: AtividadeRelatorio[] = [];
  const marcar = (quando: Date) => {
    const t = quando.getTime();
    const tolerancia = 3 * 60_000;
    return {
      fora: !emExpediente(quando, cfg),
      almoco: noAlmoco(quando, cfg),
      semPonto: !intervalos.some((i) => t >= i.ini - tolerancia && t <= i.fim + tolerancia)
    };
  };

  for (const l of logs) {
    const info = POR_ENTIDADE[l.entidade_tipo];
    const nome = l.entidade_id ? nomes.get(`${l.entidade_tipo}:${l.entidade_id}`) : undefined;
    const ent = `${info?.rotulo ?? humanizar(l.entidade_tipo)}${nome ? ` “${nome}”` : ""}`;
    const antes = ehObjeto(l.dados_antes) ? l.dados_antes : null;
    const depois = ehObjeto(l.dados_depois) ? l.dados_depois : null;
    let titulo: string;
    if (l.acao === "editar") {
      const mudou = camposAlterados(antes, depois);
      const soEtapa = antes && depois && Object.keys(antes).every((k) => k === "coluna") && "coluna" in antes;
      if (soEtapa && antes && depois) titulo = `Moveu ${ent} de “${rotuloEtapa(l.entidade_tipo, antes.coluna)}” para “${rotuloEtapa(l.entidade_tipo, depois.coluna)}”`;
      else if (mudou.length > 0) titulo = `Editou ${ent} — alterou: ${mudou.slice(0, 6).join(", ")}${mudou.length > 6 ? "..." : ""}`;
      else titulo = `Editou ${ent}`;
    } else if (l.acao === "criar" || l.acao.startsWith("criar_") || l.acao.startsWith("cadastrar_")) titulo = `Cadastrou ${ent}`;
    else if (l.acao === "excluir" || l.acao === "apagar") titulo = `Excluiu ${ent}`;
    else if (l.acao === "status_pagamento") titulo = `Alterou o status de pagamento de ${ent}`;
    else if (l.acao.startsWith("gerar_")) {
      const doc = l.acao.replace(/^gerar_/, "");
      titulo = `Gerou ${DOCUMENTOS[doc] ?? humanizar(doc)}${nome ? ` — ${nome}` : ""}`;
    } else if (ACOES[l.acao]) titulo = `${ACOES[l.acao]} ${ent}`;
    else if (l.acao.startsWith("email_")) titulo = `E-mail enviado: ${humanizar(l.acao.replace(/^email_/, "").replace(/_enviado$/, ""))}`;
    else if (l.acao === "mover_funil_cliente") titulo = `Moveu ${ent} no quadro de Clientes`;
    else if (l.acao === "transferir_corretor_cliente") titulo = `Transferiu ${ent} para outro corretor`;
    else titulo = `${cap(humanizar(l.acao))} — ${ent}`;
    itens.push({
      id: `log-${l.id}`,
      quando: l.criado_em,
      categoria: info?.cat ?? "Outros",
      titulo,
      href: l.entidade_id && info?.href ? info.href(l.entidade_id) : null,
      ...marcar(l.criado_em)
    });
  }
  for (const c of contatos) {
    const nome = nomes.get(`clientes:${c.cliente_id}`);
    itens.push({
      id: `contato-${c.id}`,
      quando: c.data,
      categoria: "Clientes",
      titulo: `${c.tipo === "Nota" ? "Anotou em" : c.tipo === "Transferência" ? "Transferiu" : `Registrou ${c.tipo.toLowerCase()} com`} cliente${nome ? ` “${nome}”` : ""}${c.resultado ? ` — ${c.resultado}` : ""}`,
      href: `/clientes/${c.cliente_id}/etiqueta`,
      ...marcar(c.data)
    });
  }
  for (const f of fin) {
    const nome = nomes.get(`avaliacoes:${f.avaliacao_id}`);
    const alvo = `avaliação${nome ? ` “${nome}”` : ""}`;
    const titulo =
      f.tipo === "etapa" ? `Moveu ${alvo} para “${f.etapa ?? humanizar(f.coluna ?? "")}”` : f.tipo === "contato" ? `Registrou contato na ${alvo}` : f.tipo === "nota" ? `Anotou na ${alvo}` : `${cap(humanizar(f.tipo))} na ${alvo}`;
    itens.push({ id: `fin-${f.id}`, quando: f.inicio, categoria: "Financiamento", titulo, href: `/financiamento/${f.avaliacao_id}/etiqueta`, ...marcar(f.inicio) });
  }
  for (const r of recr) {
    itens.push({
      id: `recr-${r.id}`,
      quando: r.data,
      categoria: "Recrutamento",
      titulo: `Registrou ${r.tipo.toLowerCase()} com ${nomeRecrutado.get(r.parceiro_id) ?? "recrutado"}${r.resultado ? ` — ${r.resultado}` : ""}`,
      href: `/recrutamento/${r.parceiro_id}`,
      ...marcar(r.data)
    });
  }

  itens.sort((a, b) => b.quando.getTime() - a.quando.getTime());
  return { itens: itens.slice(0, LIMITE), truncado: itens.length > LIMITE };
}
