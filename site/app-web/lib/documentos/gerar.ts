import fs from "node:fs/promises";
import path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { TipoDocumento } from "./campos";
import { valorPorExtenso, dataPorExtenso, dataPorExtensoComZero, formatarCpf } from "./extenso";
import { formatTelefone, formatInscricao, formatCnpj } from "@/lib/format";

// Nome do arquivo .docx (com o timbrado já formatado) que corresponde a cada
// tipo de documento. Os arquivos ficam em site/app-web/templates/ — ver
// templates/README.md para como criar/editar cada um.
const ARQUIVO_TEMPLATE: Record<TipoDocumento, string> = {
  contrato_locacao: "contrato_locacao.docx",
  contrato_compra_venda: "contrato_compra_venda.docx",
  carta_preferencia: "carta_preferencia.docx",
  contrato_administracao: "contrato_administracao.docx",
  contrato_associacao_corretor: "contrato_associacao_corretor.docx",
  contrato_associacao_corretor_estagiario: "contrato_associacao_corretor_estagiario.docx",
  termo_entrega_chaves: "termo_entrega_chaves.docx",
  recibo_honorarios: "recibo_honorarios.docx",
  repasse_administracao: "repasse_administracao.docx",
  repasse_primeira_locacao: "repasse_primeira_locacao.docx",
  contrato_gestao: "contrato_gestao.docx",
  proposta_compra_venda: "PROPOSTA DE COMPRA E VENDA.docx"
};

// URL do serviço de conversão docx -> PDF (Gotenberg rodando no Railway).
// Ex.: DOCUMENT_CONVERTER_URL=https://gotenberg-production.up.railway.app
// Se não estiver configurado, o motor devolve o .docx preenchido sem converter,
// para não travar o desenvolvimento local antes de o serviço existir.
const DOCUMENT_CONVERTER_URL = process.env.DOCUMENT_CONVERTER_URL;

export type GerarDocumentoParams = {
  tipoDocumento: TipoDocumento;
  entidadeTipo:
    | "transacao"
    | "adm_imovel"
    | "cont_corretor"
    | "cont_corretor_estagiario"
    | "parceiro"
    | "chaves"
    | "movimentacao"
    | "gestao"
    | "proposta";
  entidadeId: string;
  usuarioId?: string;
};

// Qual entidadeTipo cada modelo de documento espera (usado pela tela de
// geração em Configurações para saber que tipo de registro buscar).
// cont_corretor e cont_corretor_estagiario são dois modelos distintos: cada
// um busca só parceiros com a função correspondente (ver buscarRegistrosAction
// em lib/documentos/actions.ts).
export const ENTIDADE_POR_DOCUMENTO: Record<TipoDocumento, GerarDocumentoParams["entidadeTipo"]> = {
  contrato_locacao: "transacao",
  contrato_compra_venda: "transacao",
  carta_preferencia: "gestao",
  contrato_administracao: "adm_imovel",
  contrato_associacao_corretor: "cont_corretor",
  contrato_associacao_corretor_estagiario: "cont_corretor_estagiario",
  termo_entrega_chaves: "chaves",
  recibo_honorarios: "movimentacao",
  repasse_administracao: "movimentacao",
  repasse_primeira_locacao: "movimentacao",
  contrato_gestao: "gestao",
  proposta_compra_venda: "proposta"
};

export async function gerarDocumento(params: GerarDocumentoParams): Promise<string> {
  const { tipoDocumento, entidadeTipo, entidadeId, usuarioId } = params;

  try {
    const dados = await montarDadosDoMerge(tipoDocumento, entidadeId);
    const docxBuffer = await preencherTemplate(ARQUIVO_TEMPLATE[tipoDocumento], dados);
    const arquivoFinal = DOCUMENT_CONVERTER_URL
      ? await converterParaPdf(docxBuffer)
      : { buffer: docxBuffer, extensao: "docx" as const };

    const caminho = `${entidadeTipo}/${tipoDocumento}/${entidadeId}-${Date.now()}.${arquivoFinal.extensao}`;
    const supabase = supabaseAdmin();
    const { error: erroUpload } = await supabase.storage
      .from("documentos")
      .upload(caminho, arquivoFinal.buffer, {
        contentType:
          arquivoFinal.extensao === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      });

    if (erroUpload) throw new Error(erroUpload.message);

    const { data: urlPublica } = supabase.storage.from("documentos").getPublicUrl(caminho);

    await prisma.documentos_gerados.create({
      data: {
        entidade_tipo: entidadeTipo,
        entidade_id: entidadeId,
        tipo_documento: tipoDocumento,
        arquivo_url: urlPublica.publicUrl,
        gerado_por_usuario_id: usuarioId ?? null,
        status: "Sucesso"
      }
    });

    // Gerar o contrato de administração é o que "ativa" a administração:
    // some da lista de Captação e passa a aparecer como Ativo.
    if (tipoDocumento === "contrato_administracao") {
      await prisma.adm_imoveis.updateMany({
        where: { id: entidadeId, status: "Captação" },
        data: { status: "Ativo", updated_at: new Date() }
      });
    }

    return urlPublica.publicUrl;
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await prisma.documentos_gerados.create({
      data: {
        entidade_tipo: entidadeTipo,
        entidade_id: entidadeId,
        tipo_documento: tipoDocumento,
        gerado_por_usuario_id: usuarioId ?? null,
        status: "Erro",
        mensagem
      }
    });
    throw erro;
  }
}

// Em desenvolvimento local (TEMPLATES_LOCAL_DIR configurado no .env, apontando
// para bot-siseng/templates/), lê o arquivo direto do disco. Em produção, esse
// diretório não existe no build da Vercel — busca do bucket "templates" no
// Supabase Storage, onde uma cópia de cada .docx deve ser mantida sincronizada
// (ver bot-siseng/templates/README.md).
async function carregarTemplate(nomeArquivo: string): Promise<Buffer> {
  const pastaLocal = process.env.TEMPLATES_LOCAL_DIR;

  if (pastaLocal) {
    return fs.readFile(path.join(pastaLocal, nomeArquivo));
  }

  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage.from("templates").download(nomeArquivo);
  if (error || !data) {
    throw new Error(
      `Não consegui baixar o template "${nomeArquivo}" do bucket "templates" no Supabase Storage: ` +
        (error?.message ?? "arquivo não encontrado")
    );
  }
  return Buffer.from(await data.arrayBuffer());
}

async function preencherTemplate(
  nomeArquivo: string,
  dados: Record<string, unknown>
): Promise<Buffer> {
  const conteudoTemplate = await carregarTemplate(nomeArquivo);
  const zip = new PizZip(conteudoTemplate);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" }
  });
  doc.render(dados);
  return doc.getZip().generate({ type: "nodebuffer" });
}

async function converterParaPdf(docxBuffer: Buffer): Promise<{ buffer: Buffer; extensao: "pdf" }> {
  const form = new FormData();
  form.append("files", new Blob([new Uint8Array(docxBuffer)]), "documento.docx");
  const resposta = await fetch(`${DOCUMENT_CONVERTER_URL}/forms/libreoffice/convert`, {
    method: "POST",
    body: form
  });
  if (!resposta.ok) {
    throw new Error(`Falha ao converter para PDF (status ${resposta.status})`);
  }
  const buffer = Buffer.from(await resposta.arrayBuffer());
  return { buffer, extensao: "pdf" };
}

// Formata um valor decimal como número brasileiro simples (sem "R$"), do
// jeito que costuma aparecer dentro do corpo de um contrato: "1.850,00".
function numero(valor: unknown): string {
  const n = Number(valor ?? 0);
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function percentual(valor: unknown): string {
  const n = Number(valor ?? 0) * 100;
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

// d aqui é sempre coluna @db.Date (data_assinatura, data_vencimento,
// data_pagamento, data_nascimento, vencimento, chaves.data...) — não tem
// horário/fuso próprio, é só um dia do calendário gravado como meia-noite
// UTC. timeZone "UTC" (não "America/Porto_Velho") evita empurrar essa
// meia-noite pro dia anterior — era isso que fazia a Data de Assinatura do
// contrato de Locação/Compra e Venda sair um dia antes do que foi digitado.
function dataCurta(d: Date | null | undefined): string {
  return d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "";
}

function mesReferencia(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

// Busca os dados da entidade e monta o objeto plano de placeholders (ver
// lib/documentos/campos.ts) que o Docxtemplater usa para preencher o .docx.
async function montarDadosDoMerge(
  tipoDocumento: TipoDocumento,
  entidadeId: string
): Promise<Record<string, unknown>> {
  switch (tipoDocumento) {
    case "contrato_locacao":
    case "contrato_compra_venda":
      return montarDadosTransacao(tipoDocumento, entidadeId);
    case "carta_preferencia":
      return montarDadosGestao(entidadeId);
    case "contrato_administracao":
      return montarDadosAdmImovel(entidadeId);
    case "contrato_associacao_corretor":
    case "contrato_associacao_corretor_estagiario":
      return montarDadosContratoCorretor(entidadeId);
    case "termo_entrega_chaves":
      return montarDadosChaves(entidadeId);
    case "recibo_honorarios":
    case "repasse_administracao":
    case "repasse_primeira_locacao":
      return montarDadosMovimentacao(tipoDocumento, entidadeId);
    case "contrato_gestao":
      return montarDadosContratoGestao(entidadeId);
    case "proposta_compra_venda":
      return montarDadosProposta(entidadeId);
  }
}

// Junta uma lista em português com "e" antes do último item — usado nos
// blocos de qualificação (ex.: "João, brasileiro, ... e Maria, brasileira, ...").
function listaComE(itens: string[]): string {
  const validos = itens.filter((i) => i.trim().length > 0);
  if (validos.length === 0) return "";
  if (validos.length === 1) return validos[0];
  return `${validos.slice(0, -1).join(", ")} e ${validos[validos.length - 1]}`;
}

function docTexto(c: { cpf: string | null; cnpj: string | null }): string {
  if (c.cpf) return formatarCpf(c.cpf);
  if (c.cnpj) return formatCnpj(c.cnpj);
  return "";
}

type ClienteComEndereco = {
  nome: string;
  sexo: string | null;
  // Adicionado pro contrato de gestão (Elaboração de Contrato de Gestão,
  // portal do corretor) — clientes antigos ficam NULL, e a qualificação
  // continua inferindo brasileiro/brasileira pelo campo "sexo" nesse caso
  // (ver nacionalidadeTexto abaixo).
  nacionalidade?: string | null;
  profissao: string | null;
  cat_profissao: string | null;
  estado_civil: string | null;
  cpf: string | null;
  cnpj: string | null;
  rg: string | null;
  expedicao: string | null;
  endereco: string | null;
  cidades: { nome: string } | null;
  estados: { nome: string } | null;
};

function enderecoClienteCompleto(c: ClienteComEndereco): string {
  return [c.endereco, c.cidades?.nome, c.estados?.nome].filter((p): p is string => Boolean(p)).join(" - ");
}

// Nacionalidade textual de um cliente — usa o campo cadastrado quando
// presente (Elaboração de Contrato de Gestão sempre pede esse campo);
// clientes antigos que nunca passaram por lá ficam com nacionalidade NULL,
// então cai pro mesmo palpite por sexo que o sistema já fazia antes de o
// campo existir.
function nacionalidadeTexto(c: { nacionalidade?: string | null; sexo: string | null }): string {
  return c.nacionalidade ?? (c.sexo === "Mulher" ? "brasileira" : "brasileiro");
}

// Parágrafo de qualificação completo de uma parte (vendedor/comprador,
// locador/locatário): "Nome, nacionalidade, profissão, estado civil, RG nº
// ..., CPF nº ..., residente e domiciliado(a) em ...". Usado tanto sozinho
// (um só proprietário) quanto unido com "e" quando há mais de um (herdeiros
// etc.). RG entrou porque a qualificação sem ele fica incompleta pra um
// contrato de verdade (praxe jurídica sempre traz RG junto do CPF).
function qualificacaoTexto(c: ClienteComEndereco): string {
  const nacionalidade = nacionalidadeTexto(c);
  const profissao = c.profissao ?? c.cat_profissao ?? "";
  const estadoCivil = (c.estado_civil ?? "").toLowerCase();
  const rg = c.rg ? `portador(a) da cédula de identidade RG nº ${c.rg}${c.expedicao ? `/${c.expedicao}` : ""}` : "";
  const doc = c.cpf ? `CPF nº ${formatarCpf(c.cpf)}` : c.cnpj ? `CNPJ nº ${formatCnpj(c.cnpj)}` : "";
  const endereco = enderecoClienteCompleto(c);
  const partes = [
    c.nome,
    nacionalidade,
    profissao || null,
    estadoCivil || null,
    rg || null,
    doc || null,
    endereco ? `residente e domiciliado(a) em ${endereco}` : null
  ].filter((p): p is string => Boolean(p));
  return partes.join(", ");
}

// Nem todo cliente tem banco_id vinculado à tabela bancos (parte da base
// veio de planilha antiga só com o código do banco em texto livre) — antes
// disso o nome do banco saía em branco no contrato mesmo já tendo um código
// digitado no cadastro, o que parecia "sumir" a informação. Resolve por
// código quando a ligação com a tabela bancos ainda não foi feita.
async function resolverBanco(cliente: {
  bancos: { nome: string; codigo: string | null } | null;
  codigo_banco: string | null;
}): Promise<{ nome: string; codigo: string }> {
  if (cliente.bancos) {
    return { nome: cliente.bancos.nome, codigo: cliente.bancos.codigo ?? cliente.codigo_banco ?? "" };
  }
  if (cliente.codigo_banco) {
    const encontrado = await prisma.bancos.findFirst({ where: { codigo: cliente.codigo_banco } });
    if (encontrado) return { nome: encontrado.nome, codigo: encontrado.codigo ?? cliente.codigo_banco };
    return { nome: "", codigo: cliente.codigo_banco };
  }
  return { nome: "", codigo: "" };
}

// Bloco de assinatura de uma parte: linha em branco + nome + documento +
// papel (VENDEDOR(A), COMPRADOR(A) etc.), um por parágrafo (linebreaks:
// true já está configurado no Docxtemplater, então "\n" vira quebra real).
function blocoAssinatura(nome: string, documento: string, papel: string): string {
  return `___________________________\n${nome}\n${documento}\n${papel}`;
}

// Uma linha de condição de pagamento por extenso: antes só entravam Tipo,
// Valor e Forma de pagamento no contrato — Parcelas, Momento e Data de
// pagamento ficavam de fora do texto mesmo já preenchidos no cadastro.
function linhaCondicaoPagamento(c: {
  tipo: string | null;
  valor: unknown;
  forma_pagamento: string | null;
  parcelas: number | null;
  momento: string | null;
  data_pagamento: Date | null;
}): string {
  const partes = [
    `${c.tipo ?? "Parcela"}: R$ ${numero(c.valor)}`,
    c.parcelas ? `em ${c.parcelas}x` : null,
    c.forma_pagamento ? `forma de pagamento ${c.forma_pagamento}` : null,
    c.momento ? `no momento ${c.momento}` : null,
    c.data_pagamento ? `com vencimento em ${dataCurta(c.data_pagamento)}` : null
  ].filter((p): p is string => Boolean(p));
  return partes.join(", ");
}

async function montarDadosTransacao(
  tipoDocumento: "contrato_locacao" | "contrato_compra_venda",
  transacaoId: string
): Promise<Record<string, unknown>> {
  const t = await prisma.transacoes.findUnique({
    where: { id: transacaoId },
    include: {
      imoveis: {
        include: {
          imoveis_proprietarios: {
            orderBy: { ordem: "asc" },
            include: { clientes: { include: { cidades: true, estados: true, bancos: true } } }
          }
        }
      },
      transacoes_contrapartes: {
        orderBy: { ordem: "asc" },
        include: { clientes: { include: { cidades: true, estados: true, bancos: true } } }
      },
      lojas: true,
      adm_imoveis: true,
      condicoes_pagamento: true,
      parceiros_transacoes_corretor_proprietario_idToparceiros: { include: { bancos: true } },
      parceiros_transacoes_corretor_contraparte_idToparceiros: { include: { bancos: true } },
      parceiros_transacoes_parceiro_externo_idToparceiros: { include: { bancos: true } }
    }
  });
  if (!t) throw new Error(`Transação "${transacaoId}" não encontrada.`);

  const proprietarios = t.imoveis?.imoveis_proprietarios.map((v) => v.clientes) ?? [];
  const interessados = t.transacoes_contrapartes.map((v) => v.clientes);
  if (proprietarios.length === 0) {
    throw new Error(
      "O imóvel desta transação não tem nenhum proprietário cadastrado — adicione ao menos um em Imóveis antes de gerar o contrato."
    );
  }
  if (interessados.length === 0) {
    throw new Error("Esta transação não tem nenhum Cliente Interessado cadastrado — adicione ao menos um.");
  }

  const hoje = new Date();
  const idTransacao = t.id_legado ?? t.id;

  if (tipoDocumento === "contrato_locacao") {
    const primeiroInteressado = interessados[0];
    return {
      TipoCliente: listaComE(proprietarios.map(qualificacaoTexto)),
      TipoClienteCliente1: listaComE(interessados.map(qualificacaoTexto)),
      Cliente: proprietarios.map((c) => c.nome).join(", "),
      "Cpf/Cnpj": proprietarios.map(docTexto).join(", "),
      Cliente1: interessados.map((c) => c.nome).join(", "),
      "Cpf/CnpjCliente1": interessados.map(docTexto).join(", "),
      EstadoCivilCliente1: primeiroInteressado.estado_civil ?? "",
      ProficaoCliente1: primeiroInteressado.profissao ?? primeiroInteressado.cat_profissao ?? "",
      EmailCliente1: primeiroInteressado.email ?? "",
      TelefoneCliente1: formatTelefone(primeiroInteressado.telefone),
      TipoImovel: t.imoveis?.tipo_imovel ?? "",
      EnderecoImovel: t.imoveis?.endereco ?? "",
      Inscricao: formatInscricao(t.imoveis?.inscricao),
      Matricula: t.imoveis?.matricula ?? "",
      // uc_caerd/uc_energisa vivem no cadastro da Administração (quando essa
      // locação está vinculada a uma) — a transação de locação em si não
      // tem esses campos.
      UcEnergisa: t.adm_imoveis?.uc_energisa ?? "",
      UcCaerd: t.adm_imoveis?.uc_caerd ?? "",
      Observacao: t.observacao ?? "",
      TextoFinalidadeLocacao: t.finalidade_locacao ?? "",
      PrazoContrato: t.prazo_contrato_meses ?? "",
      DataAssinatura: dataCurta(t.data_assinatura ?? hoje),
      DataVencimento: dataCurta(t.data_vencimento),
      ValorTransacao: numero(t.valor_transacao),
      DiaVencimento: t.dia_vencimento ?? "",
      FormaPagamento: t.forma_pagamento ?? "",
      Encargos: (t.encargos ?? []).length > 0 ? ` ${(t.encargos ?? []).join(", ")}.` : " nenhum encargo adicional.",
      Garantia: t.garantia ?? "",
      ValorCaucao: t.valor_caucao != null ? numero(t.valor_caucao) : "",
      PgCaucao: t.pg_caucao ?? "",
      Loja: t.lojas.nome,
      DataAssinaturaExtenso: dataPorExtenso(t.data_assinatura ?? hoje),
      // Rodapé: identificador da transação e, se vinculada a uma
      // administração, o identificador dela também.
      IdTransacao: idTransacao,
      IdAdmImovel: t.adm_imoveis?.id_legado ?? t.adm_imoveis?.id ?? ""
    };
  }

  const corretorProprietario = t.parceiros_transacoes_corretor_proprietario_idToparceiros;
  const corretorContraparte = t.parceiros_transacoes_corretor_contraparte_idToparceiros;
  const parceiroExterno = t.parceiros_transacoes_parceiro_externo_idToparceiros;
  const primeiroVendedor = proprietarios[0];
  const bancoVendedor = await resolverBanco(primeiroVendedor);

  // Rateio do honorário — mesmo cálculo ao vivo já usado no formulário de
  // Comissionamento (ver TransacaoForm): valor total primeiro, parceria
  // (se tiver) descontada antes, e só depois divide o restante entre
  // corretor do proprietário, corretor da contraparte e imobiliária. Antes
  // essa parte só listava o banco dos dois corretores, sem nenhum valor ou
  // percentual — não dava pra saber quanto cada um recebia de fato.
  const honorarioTotal = Number(t.valor_transacao) * Number(t.porc_honorario ?? 0);
  const valorParceria = t.tem_parceria ? honorarioTotal * Number(t.porc_parceria ?? 0) : 0;
  const restanteRateio = honorarioTotal - valorParceria;
  const valorCorretorProprietario = restanteRateio * Number(t.porc_corretor_proprietario ?? 0);
  const valorCorretorContraparte = restanteRateio * Number(t.porc_corretor_contraparte ?? 0);
  const valorImobiliaria = restanteRateio * Number(t.porc_imobiliaria ?? 0);

  function linhaHonorario(nome: string, valor: number, corretor: { bancos: { nome: string; codigo: string | null } | null; codigo_banco: string | null; agencia: string | null; conta: string | null; tipo_pix: string | null; pix: string | null } | null): string {
    const banco = corretor?.bancos?.nome ?? corretor?.codigo_banco ?? "—";
    const dadosBancarios = corretor
      ? ` — Banco ${banco}, Ag. ${corretor.agencia ?? "—"}, Conta ${corretor.conta ?? "—"}${
          corretor.pix ? `, Pix (${corretor.tipo_pix ?? "—"}): ${corretor.pix}` : ""
        }`
      : "";
    return `${nome}: ${numero(valor)}${dadosBancarios}`;
  }

  const linhasHonorario: string[] = [];
  linhasHonorario.push(`Honorário total (${percentual(t.porc_honorario)} sobre o valor da transação): ${numero(honorarioTotal)}`);
  if (t.tem_parceria && parceiroExterno) {
    linhasHonorario.push(linhaHonorario(`Parceria — ${parceiroExterno.nome} (${percentual(t.porc_parceria)})`, valorParceria, parceiroExterno));
  }
  if (corretorProprietario) {
    linhasHonorario.push(
      linhaHonorario(`Corretor do proprietário — ${corretorProprietario.nome} (${percentual(t.porc_corretor_proprietario)})`, valorCorretorProprietario, corretorProprietario)
    );
  }
  if (corretorContraparte) {
    linhasHonorario.push(
      linhaHonorario(`Corretor da contraparte — ${corretorContraparte.nome} (${percentual(t.porc_corretor_contraparte)})`, valorCorretorContraparte, corretorContraparte)
    );
  }
  if (Number(t.porc_imobiliaria ?? 0) > 0) {
    linhasHonorario.push(`Imobiliária (${percentual(t.porc_imobiliaria)}): ${numero(valorImobiliaria)}`);
  }

  return {
    QualificacaoVendedor: listaComE(proprietarios.map(qualificacaoTexto)),
    QualificacaoComprador: listaComE(interessados.map(qualificacaoTexto)),
    TextoObjetoImovel:
      `O imóvel objeto deste contrato é o localizado em ${t.imoveis?.endereco ?? "endereço não informado"}` +
      `${t.imoveis?.matricula ? `, matrícula nº ${t.imoveis.matricula}` : ""}` +
      `${t.imoveis?.inscricao ? `, inscrição imobiliária ${formatInscricao(t.imoveis.inscricao)}` : ""}` +
      `${t.imoveis?.descricao ? `, com a seguinte descrição: ${t.imoveis.descricao}` : ""}`,
    ValorTransacao: `${numero(t.valor_transacao)} (${valorPorExtenso(Number(t.valor_transacao))})`,
    CondicoesPagamento: t.condicoes_pagamento.map(linhaCondicaoPagamento).join("\n"),
    BancoVendedor: bancoVendedor.nome,
    CodigoBancoVendedor: bancoVendedor.codigo,
    AgenciaVendedor: primeiroVendedor.agencia ?? "",
    ContaVendedor: primeiroVendedor.conta ?? "",
    TipoPixVendedor: primeiroVendedor.tipo_pix ?? "",
    PixVendedor: primeiroVendedor.pix ?? "",
    TextoHonorarios: linhasHonorario.length > 0 ? linhasHonorario.join("\n") : "A combinar entre as partes.",
    Chave: t.chave ?? "",
    Loja: t.lojas.nome,
    DataAssinaturaExtenso: dataPorExtenso(t.data_assinatura ?? hoje),
    TextoAssinaturas: [
      ...proprietarios.map((c) => blocoAssinatura(c.nome, docTexto(c), "VENDEDOR(A)")),
      ...interessados.map((c) => blocoAssinatura(c.nome, docTexto(c), "COMPRADOR(A)"))
    ].join("\n\n"),
    TextoAssinaturasCorretores: [corretorProprietario, corretorContraparte]
      .filter((p, i, arr): p is NonNullable<typeof p> => Boolean(p) && arr.findIndex((x) => x?.id === p?.id) === i)
      .map((p) => blocoAssinatura(p.nome, `CRECI ${p.creci ?? "—"}`, "CORRETOR(A)"))
      .join("\n\n"),
    // Rodapé.
    IdTransacao: idTransacao
  };
}

async function montarDadosGestao(gestaoId: string): Promise<Record<string, unknown>> {
  const g = await prisma.gestoes.findUnique({
    where: { id: gestaoId },
    include: { clientes: true, imoveis: true }
  });
  if (!g) throw new Error(`Gestão "${gestaoId}" não encontrada.`);

  return {
    proprietario_nome: g.clientes.nome,
    imovel_endereco: g.imoveis.endereco ?? "",
    valor_venda: numero(g.valor_venda),
    prazo_gestao_meses: g.prazo_gestao_meses ?? "",
    porc_honorario: percentual(g.porc_honorario),
    data_emissao: dataCurta(new Date())
  };
}

// Contrato de Gestão (Captação Exclusiva) — nasce do formulário "Elaboração
// de Contrato de Gestão" no portal do corretor. gestoes.cliente_id guarda
// o CONTRATANTE principal (primeiro cliente preenchido no formulário, o
// único que aparece na qualificação do corpo do contrato); os demais
// clientes que o corretor tiver cadastrado no mesmo formulário entram como
// mais proprietários do imóvel (imoveis_proprietarios, mesmo padrão do
// contrato de administração) e só aparecem no bloco de assinatura, via
// AssinaturasAdicionais.
async function montarDadosContratoGestao(gestaoId: string): Promise<Record<string, unknown>> {
  const g = await prisma.gestoes.findUnique({
    where: { id: gestaoId },
    include: {
      clientes: { include: { cidades: true, estados: true } },
      parceiros: true,
      imoveis: {
        include: {
          cidades: true,
          estados: true,
          imoveis_proprietarios: {
            orderBy: { ordem: "asc" },
            include: { clientes: true }
          }
        }
      }
    }
  });
  if (!g) throw new Error(`Gestão "${gestaoId}" não encontrada.`);

  const principal = g.clientes;
  const demaisProprietarios = g.imoveis.imoveis_proprietarios
    .map((v) => v.clientes)
    .filter((c) => c.id !== principal.id);

  const hoje = new Date();

  return {
    NomeRazaoSocial: principal.nome,
    RG: principal.rg ?? "",
    CpfCnpj: docTexto(principal),
    EnderecoCompleto: enderecoClienteCompleto(principal),
    Nacionalidade: nacionalidadeTexto(principal),
    EstadoCivil: principal.estado_civil ?? "",
    Email: principal.email ?? "",
    TelefoneCelular: formatTelefone(principal.telefone),
    // O formulário do portal só pede um telefone — Telefone reserva fica em
    // branco no contrato até um dia existir um segundo campo de telefone no
    // cadastro de Cliente.
    TelefoneReserva: "",
    AssinaturasAdicionais:
      demaisProprietarios.length > 0
        ? demaisProprietarios.map((c) => blocoAssinatura(c.nome, docTexto(c), "CONTRATANTE")).join("\n\n")
        : "",
    TipoImovel: g.imoveis.tipo_imovel ?? "",
    Rua: g.imoveis.rua ?? "",
    Numero: g.imoveis.n_predial ?? "",
    Complemento: g.imoveis.complemento ?? "",
    Bairro: g.imoveis.bairro ?? "",
    // Mesmo par Cidade/Estado alimenta a cláusula de Foro e a linha de
    // local/data perto da assinatura — faz sentido nos dois casos, já que o
    // foro de um contrato de gestão é o da comarca onde fica o imóvel.
    Cidade: g.imoveis.cidades?.nome ?? "",
    Estado: g.imoveis.estados?.nome ?? "",
    NumeroMatricula: g.imoveis.matricula ?? "",
    InscricaoMunicipal: formatInscricao(g.imoveis.inscricao),
    ValorImovel: numero(g.valor_venda),
    PrazoGestao: g.prazo_gestao_dias ?? "",
    PorcentagemHonorarios: percentual(g.porc_honorario),
    DataFechamento: dataCurta(g.data_assinatura ?? hoje),
    Corretor: g.parceiros?.nome ?? "",
    CorretorCpf: formatarCpf(g.parceiros?.cpf ?? ""),
    Creci: g.parceiros?.creci ?? ""
  };
}

// Proposta de Compra e Venda — nasce do formulário homônimo no portal do
// corretor (app/portal/proposta/novo). Diferente do Contrato de Gestão, o
// imóvel NUNCA é um registro real de `imoveis`: rua/número/complemento/
// bairro/cidade/estado/descrição ficam gravados só como texto direto nesta
// linha de `propostas` (a proposta normalmente é sobre imóvel externo, sem
// proprietário cadastrado). ValorProposta segue o mesmo padrão de
// ValorTransacao do contrato de compra e venda: número + por extenso.
async function montarDadosProposta(propostaId: string): Promise<Record<string, unknown>> {
  const p = await prisma.propostas.findUnique({
    where: { id: propostaId },
    include: {
      clientes: { include: { cidades: true, estados: true } },
      parceiros: true
    }
  });
  if (!p) throw new Error(`Proposta "${propostaId}" não encontrada.`);

  const cliente = p.clientes;

  return {
    ParceiroCorretor: p.parceiros?.nome ?? "",
    NomeRazaoSocial: cliente.nome,
    CpfCnpj: docTexto(cliente),
    EnderecoCompleto: enderecoClienteCompleto(cliente),
    EstadoCivil: cliente.estado_civil ?? "",
    Descricao: p.descricao ?? "",
    Rua: p.rua ?? "",
    Numero: p.numero ?? "",
    Complemento: p.complemento ?? "",
    Bairro: p.bairro ?? "",
    Cidade: p.cidade ?? "",
    Estado: p.estado ?? "",
    ValorProposta: `${numero(p.valor_proposta)} (${valorPorExtenso(Number(p.valor_proposta))})`,
    FormaPagamento: p.forma_pagamento ?? "",
    DataFechamento: dataCurta(p.data_fechamento),
    Creci: p.parceiros?.creci ?? ""
  };
}

// O imóvel pode ter mais de um proprietário cadastrado (ex.: herdeiros) — o
// template tem um loop {{#Proprietarios}}...{{/Proprietarios}} tanto no
// parágrafo de qualificação quanto no bloco de assinatura, então todos
// entram na mesma lista. Quando há cônjuge, ele é cadastrado como mais um
// Cliente e adicionado à lista de proprietários do imóvel (não há mais um
// campo de cônjuge separado).
async function montarDadosAdmImovel(admImovelId: string): Promise<Record<string, unknown>> {
  const a = await prisma.adm_imoveis.findUnique({
    where: { id: admImovelId },
    include: {
      imoveis: {
        include: {
          imoveis_proprietarios: {
            orderBy: { ordem: "asc" },
            include: {
              clientes: { include: { bancos: true, cidades: true, estados: true } }
            }
          }
        }
      },
      lojas: true
    }
  });
  if (!a) throw new Error(`Administração "${admImovelId}" não encontrada.`);

  const proprietarios = a.imoveis.imoveis_proprietarios.map((v) => v.clientes);
  if (proprietarios.length === 0) {
    throw new Error(
      "O imóvel desta administração não tem nenhum proprietário cadastrado — adicione ao menos um antes de gerar o contrato."
    );
  }
  // Dados bancários do repasse usam sempre o primeiro proprietário da lista.
  const primeiro = proprietarios[0];

  function enderecoCompleto(c: (typeof proprietarios)[number]): string {
    return [c.endereco, c.cidades?.nome, c.estados?.nome].filter((p): p is string => Boolean(p)).join(" - ");
  }

  return {
    Proprietarios: proprietarios.map((c) => ({
      Nome: c.nome,
      Nacionalidade: c.sexo === "Mulher" ? "brasileira" : "brasileiro",
      Profissao: c.profissao ?? c.cat_profissao ?? "",
      EstadoCivil: c.estado_civil ?? "",
      Cpf: formatarCpf(c.cpf ?? ""),
      Endereco: enderecoCompleto(c)
    })),
    Cliente: primeiro.nome,
    Banco: primeiro.bancos?.nome ?? "",
    Codigo: primeiro.bancos?.codigo ?? primeiro.codigo_banco ?? "",
    Agencia: primeiro.agencia ?? "",
    Conta: primeiro.conta ?? "",
    TipoPix: primeiro.tipo_pix ?? "",
    Pix: primeiro.pix ?? "",
    Imovel_Endereco: a.imoveis.endereco ?? "",
    Imovel_Matricula: a.imoveis.matricula ?? "",
    InscricaoFormatada: formatInscricao(a.imoveis.inscricao),
    Imovel_Descricao: a.imoveis.descricao ?? "",
    PorcHonorario: percentual(a.porc_honorario),
    TxAdm: percentual(a.tx_administracao),
    Loja: a.lojas.nome,
    // Mesmo padrão de data por extenso com dia em 2 dígitos usado nos
    // contratos de corretor, na linha de local/data perto da assinatura.
    DataAssinatura: dataPorExtensoComZero(a.data_assinatura ?? new Date()),
    // Usado só no rodapé ("Página X de Y — Identificado da administração
    // ..."), pra dar pra saber de qual administração é aquela página solta.
    IdAdmImovel: a.id_legado ?? a.id
  };
}

// entidadeId aqui é o id do parceiro (Corretor ou Corretor Estagiário), não
// de um registro de contratos_corretor: os dados de comissionamento (fee,
// %compra, %venda, dia do fee) já vivem direto na ficha do parceiro e são
// editados por lá, então a geração do contrato lê sempre o valor atual.
// Campos no formato exato usado nos dois templates reais (ver
// campos.ts e templates/contrato_associacao_corretor*.docx).
async function montarDadosContratoCorretor(parceiroId: string): Promise<Record<string, unknown>> {
  const p = await prisma.parceiros.findUnique({
    where: { id: parceiroId },
    include: { lojas: true }
  });
  if (!p) throw new Error(`Parceiro "${parceiroId}" não encontrado.`);

  return {
    Parceiro: p.nome,
    EstadoCivil: p.estado_civil ?? "",
    DataNascimento: dataCurta(p.data_nascimento),
    CPF: formatarCpf(p.cpf ?? ""),
    Creci: p.creci ?? "",
    Email: p.email ?? "",
    Telefone: formatTelefone(p.telefone),
    Endereco: p.endereco ?? "",
    Fee: p.fee != null ? numero(p.fee) : "",
    PorcCompr: percentual(p.porc_compr),
    PorcVend: percentual(p.porc_vend),
    DiaFee: p.dia_fee ?? "",
    Cidade: p.lojas?.cidade ?? "",
    Estado: p.lojas?.estado ?? "",
    // Só esse campo (linha de local/data perto da assinatura) usa data por
    // extenso com dia em 2 dígitos — os demais usos de Cidade/Estado nesses
    // templates (ex.: cláusula de foro) continuam normais.
    DataEntrada: dataPorExtensoComZero(p.data_entrada)
  };
}

async function montarDadosChaves(chavesId: string): Promise<Record<string, unknown>> {
  const k = await prisma.chaves.findUnique({
    where: { id: chavesId },
    include: {
      transacoes: {
        include: {
          clientes_transacoes_cliente_contraparte_idToclientes: true,
          imoveis: true,
          parceiros_transacoes_corretor_proprietario_idToparceiros: true,
          parceiros_transacoes_corretor_contraparte_idToparceiros: true
        }
      }
    }
  });
  if (!k) throw new Error(`Registro de chaves "${chavesId}" não encontrado.`);

  const t = k.transacoes;
  const corretorResponsavel =
    t.parceiros_transacoes_corretor_contraparte_idToparceiros?.nome ??
    t.parceiros_transacoes_corretor_proprietario_idToparceiros?.nome ??
    "";

  return {
    transacao_tipo: t.tipo,
    imovel_endereco: t.imoveis?.endereco ?? "",
    recebedor_nome: t.clientes_transacoes_cliente_contraparte_idToclientes.nome,
    corretor_responsavel: corretorResponsavel,
    data_entrega: dataCurta(k.data ?? new Date())
  };
}

async function montarDadosMovimentacao(
  tipoDocumento: "recibo_honorarios" | "repasse_administracao" | "repasse_primeira_locacao",
  movimentacaoId: string
): Promise<Record<string, unknown>> {
  const m = await prisma.movimentacoes.findUnique({
    where: { id: movimentacaoId },
    include: {
      parceiros: true,
      categorias_financeiras: true,
      transacoes: {
        include: {
          clientes_transacoes_cliente_idToclientes: true,
          clientes_transacoes_cliente_contraparte_idToclientes: true,
          imoveis: true
        }
      }
    }
  });
  if (!m) throw new Error(`Movimentação "${movimentacaoId}" não encontrada.`);

  const t = m.transacoes;

  if (tipoDocumento === "recibo_honorarios") {
    return {
      parceiro_nome: m.parceiros?.nome ?? "",
      transacao_referencia: t?.chave ?? t?.id ?? "",
      valor_honorario: numero(m.valor),
      valor_honorario_extenso: valorPorExtenso(Number(m.valor)),
      categoria: m.categorias_financeiras.nome,
      data_pagamento: dataCurta(m.data_pagamento ?? new Date())
    };
  }

  if (tipoDocumento === "repasse_administracao") {
    return {
      proprietario_nome: t?.clientes_transacoes_cliente_idToclientes.nome ?? "",
      imovel_endereco: t?.imoveis?.endereco ?? "",
      mes_referencia: mesReferencia(m.vencimento),
      valor_administracao: numero(t?.valor_administracao),
      valor_repasse: numero(m.valor),
      data_repasse: dataCurta(m.data_pagamento ?? new Date())
    };
  }

  return {
    proprietario_nome: t?.clientes_transacoes_cliente_idToclientes.nome ?? "",
    locatario_nome: t?.clientes_transacoes_cliente_contraparte_idToclientes.nome ?? "",
    imovel_endereco: t?.imoveis?.endereco ?? "",
    mes_referencia: mesReferencia(m.vencimento),
    valor_repasse: numero(m.valor),
    data_repasse: dataCurta(m.data_pagamento ?? new Date())
  };
}
