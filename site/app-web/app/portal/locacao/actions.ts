"use server";

import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { logAlteracaoPortal } from "@/lib/auth";
import { valorEditavelParaDecimal, percentualParaDecimal, somarMeses, formatMoeda, formatData } from "@/lib/format";
import { registrarEJogarErro } from "@/lib/erros";
import { STATUS_LOCACAO_OPCOES } from "@/lib/transacoes/opcoes";
import { enviarEmail, type EmailAnexo } from "@/lib/email";
import { buscarClienteDuplicado, mensagemClienteDuplicado } from "@/lib/clientes/duplicidade";
import { criarUploadAssinadoDocumento, criarLinkDownloadDocumento, baixarDocumentoPortal } from "@/lib/supabase-admin";

const EMAIL_DESTINO_PADRAO = "engimob@remax.com.br";

// Mesmo motivo do Contrato de Compra e Venda (ver comentário lá): documento
// nunca passa pela Server Action de cadastro — a Vercel tem um limite FIXO
// de 4,5MB por requisição de função. O navegador chama esta action só pra
// pedir uma URL de upload assinada, sobe o arquivo direto pro Supabase, e
// manda pra gerarLocacaoAction só o caminho já salvo.
export async function prepararUploadDocumentoAction(
  nomeArquivo: string
): Promise<{ ok: true; caminho: string; token: string } | { ok: false; erro: string }> {
  await requirePortalSession();
  try {
    const { caminho, token } = await criarUploadAssinadoDocumento(nomeArquivo);
    return { ok: true, caminho, token };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : String(erro) };
  }
}

type DocumentoEnviado = { caminho: string; nomeOriginal: string };

function parseDocumentos(formData: FormData): DocumentoEnviado[] {
  const bruto = texto(formData, "documentosJson");
  if (!bruto) return [];
  try {
    const lista = JSON.parse(bruto);
    if (!Array.isArray(lista)) return [];
    return lista
      .map((d) => ({
        caminho: String(d?.caminho ?? "").trim(),
        nomeOriginal: String(d?.nomeOriginal ?? "").trim() || "documento"
      }))
      .filter((d) => d.caminho.length > 0);
  } catch {
    return [];
  }
}

async function montarLinksDocumentos(documentos: DocumentoEnviado[]): Promise<string> {
  if (documentos.length === 0) {
    return "<p>Nenhum documento foi anexado no cadastro — cobrar do corretor se precisar.</p>";
  }
  const links = await Promise.all(
    documentos.map(async (d) => {
      const url = await criarLinkDownloadDocumento(d.caminho);
      return url ? `<li><a href="${url}">${d.nomeOriginal}</a></li>` : `<li>${d.nomeOriginal} (link indisponível)</li>`;
    })
  );
  return `<p>${documentos.length} documento(s) anexado(s) — link válido por 7 dias:</p><ul>${links.join("")}</ul>`;
}

const ORCAMENTO_ANEXOS_BYTES = 18 * 1024 * 1024;

async function montarAnexosDocumentos(documentos: DocumentoEnviado[]): Promise<EmailAnexo[]> {
  const anexos: EmailAnexo[] = [];
  let usado = 0;
  for (const d of documentos) {
    const conteudo = await baixarDocumentoPortal(d.caminho);
    if (!conteudo) continue;
    if (usado + conteudo.length > ORCAMENTO_ANEXOS_BYTES) continue;
    anexos.push({ filename: d.nomeOriginal, content: conteudo });
    usado += conteudo.length;
  }
  return anexos;
}

function texto(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function digitos(valor: string | null): string | null {
  if (!valor) return null;
  const d = valor.replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

function booleano(formData: FormData, campo: string): boolean {
  return formData.get(campo) === "on" || formData.get(campo) === "true";
}

function data(formData: FormData, campo: string): Date | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inteiro(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

// Um locatário — ou já cadastrado (clienteId presente, reaproveitado sem
// edição) ou novo (digitado na hora). Mesmo padrão do Contrato de Compra e
// Venda (app/portal/compra-venda/actions.ts#parseClientes).
type ClienteDigitado = {
  clienteId?: string;
  nome: string;
  rg: string;
  cpfCnpj: string;
  endereco: string;
  nacionalidade: string;
  estadoCivil: string;
  profissao: string;
  email: string;
  telefone: string;
  bancoId: string;
  codigoBanco: string;
  agencia: string;
  conta: string;
  tipoConta: string;
  tipoPix: string;
  pix: string;
};

function parseClientes(formData: FormData, campo: string): ClienteDigitado[] {
  const bruto = texto(formData, campo);
  if (!bruto) return [];
  try {
    const lista = JSON.parse(bruto);
    if (!Array.isArray(lista)) return [];
    return lista
      .map((c) => ({
        clienteId: typeof c?.clienteId === "string" && c.clienteId.length > 0 ? c.clienteId : undefined,
        nome: String(c?.nome ?? "").trim(),
        rg: String(c?.rg ?? "").trim(),
        cpfCnpj: String(c?.cpfCnpj ?? "").trim(),
        endereco: String(c?.endereco ?? "").trim(),
        nacionalidade: String(c?.nacionalidade ?? "").trim(),
        estadoCivil: String(c?.estadoCivil ?? "").trim(),
        profissao: String(c?.profissao ?? "").trim(),
        email: String(c?.email ?? "").trim(),
        telefone: String(c?.telefone ?? "").trim(),
        bancoId: String(c?.bancoId ?? "").trim(),
        codigoBanco: String(c?.codigoBanco ?? "").trim(),
        agencia: String(c?.agencia ?? "").trim(),
        conta: String(c?.conta ?? "").trim(),
        tipoConta: String(c?.tipoConta ?? "").trim(),
        tipoPix: String(c?.tipoPix ?? "").trim(),
        pix: String(c?.pix ?? "").trim()
      }))
      .filter((c) => c.clienteId || c.nome.length > 0);
  } catch {
    return [];
  }
}

async function criarCliente(c: ClienteDigitado, parceiroId: string) {
  const doc = digitos(c.cpfCnpj);
  const ehCnpj = (doc?.length ?? 0) === 14;
  return prisma.clientes.create({
    data: {
      nome: c.nome,
      tipo_cliente: ehCnpj ? "Pessoa Jurídica" : "Pessoa Física",
      rg: c.rg || null,
      cpf: !ehCnpj ? doc : null,
      cnpj: ehCnpj ? doc : null,
      endereco: c.endereco || null,
      nacionalidade: c.nacionalidade || null,
      estado_civil: c.estadoCivil || null,
      profissao: c.profissao || null,
      email: c.email || null,
      telefone: digitos(c.telefone),
      banco_id: c.bancoId || null,
      codigo_banco: c.codigoBanco || null,
      agencia: c.agencia || null,
      conta: c.conta || null,
      tipo_conta: c.tipoConta || null,
      tipo_pix: c.tipoPix || null,
      pix: c.pix || null,
      parceiro_id: parceiroId
    }
  });
}

// Mesmo esquema de numeração do admin (LOC-0001, LOC-0002...) — as duas
// origens (admin e portal) escrevem na mesma tabela transacoes, então o
// próximo número sempre olha pra todos os registros com esse prefixo, não só
// os criados por aqui.
async function gerarProximoIdLocacao(): Promise<string> {
  const registros = await prisma.transacoes.findMany({
    where: { id_legado: { startsWith: "LOC-" } },
    select: { id_legado: true }
  });

  let maior = 0;
  for (const r of registros) {
    const n = Number(r.id_legado?.replace("LOC-", ""));
    if (Number.isFinite(n) && n > maior) maior = n;
  }

  return `LOC-${String(maior + 1).padStart(4, "0")}`;
}

// O Cliente Proprietário de uma transação não é escolhido no formulário —
// vem direto do(s) proprietário(s) já cadastrados no Imóvel (o primeiro da
// lista), mesma regra usada no admin (components/transacao-form.tsx).
async function proprietarioDoImovel(imovelId: string): Promise<string | null> {
  const primeiro = await prisma.imoveis_proprietarios.findFirst({
    where: { imovel_id: imovelId },
    orderBy: { ordem: "asc" },
    select: { cliente_id: true }
  });
  return primeiro?.cliente_id ?? null;
}

// Gera a "Elaboração de Locação" a partir do portal do corretor. Duas
// origens possíveis pro imóvel/proprietário:
//
// 1. Através de uma Administração já Ativa (adm_imovel_id preenchido): o
//    imóvel e o proprietário vêm dela — nunca são escolhidos direto aqui.
//    Ao cadastrar, a administração passa sozinha de Ativo para Locado (só
//    se ainda estiver Ativo — updateMany condicional evita corrida caso
//    duas locações sejam cadastradas ao mesmo tempo pra mesma
//    administração). Status da transação: "Elaboração de Contrato de
//    Locação".
//
// 2. Sem administração: ou reaproveita um imóvel já captado (de qualquer
//    corretor da imobiliária, que não tenha administração ativa — esse
//    precisa passar pela opção 1), ou cadastra um imóvel novo com o(s)
//    proprietário(s) na hora (mesmo padrão de Compra e Venda/Administração:
//    reaproveita cliente existente se escolhido, cria só os que forem
//    realmente novos, com checagem de duplicidade). Status da transação:
//    "Imóvel em locação sem administração".
//
// O(s) locatário(s) seguem o mesmo padrão (existente reaproveitado ou novo
// cadastrado na hora). Não gera contrato nenhum — só cadastra a transação
// de verdade, pro administrativo gerar o documento (Contrato de locação,
// conforme a loja) e dar sequência, inclusive a divisão do comissionamento
// entre os corretores. "Gerar boletos" não é oferecido aqui — fica só no
// administrativo.
export async function gerarLocacaoAction(
  formData: FormData
): Promise<
  | { ok: true; idLegado: string | null; emailEnviado: boolean; emailErro?: string }
  | { ok: false; erro: string }
> {
  const session = await requirePortalSession();

  try {
    const lojaId = texto(formData, "loja_id");
    const admImovelId = texto(formData, "adm_imovel_id");
    const imovelIdExistente = texto(formData, "imovel_id");

    const locatariosForm = parseClientes(formData, "locatariosJson");
    if (!lojaId) {
      return { ok: false, erro: "Selecione a loja." };
    }
    if (locatariosForm.length === 0) {
      return { ok: false, erro: "Adicione ao menos um locatário." };
    }

    // Dados do imóvel novo — só pedidos quando não é via administração e o
    // imóvel ainda não existe no sistema.
    let proprietariosForm: ClienteDigitado[] = [];
    let tipoImovelNovo: string | null = null;
    let ruaNovo: string | null = null;
    let nPredialNovo: string | null = null;
    let complementoNovo: string | null = null;
    let bairroNovo: string | null = null;
    let cidadeIdNovo: string | null = null;
    let estadoIdNovo: string | null = null;
    let matriculaNovo: string | null = null;
    let inscricaoNovo: string | null = null;

    if (!admImovelId && !imovelIdExistente) {
      proprietariosForm = parseClientes(formData, "proprietariosJson");
      if (proprietariosForm.length === 0) {
        return { ok: false, erro: "Cadastre ao menos um proprietário do imóvel novo." };
      }
      tipoImovelNovo = texto(formData, "tipo_imovel");
      ruaNovo = texto(formData, "rua");
      if (!tipoImovelNovo || !ruaNovo) {
        return { ok: false, erro: "Preencha ao menos o tipo do imóvel e a rua do imóvel novo." };
      }
      nPredialNovo = texto(formData, "n_predial");
      complementoNovo = texto(formData, "complemento");
      bairroNovo = texto(formData, "bairro");
      cidadeIdNovo = texto(formData, "cidade_id");
      estadoIdNovo = texto(formData, "estado_id");
      matriculaNovo = texto(formData, "matricula");
      inscricaoNovo = texto(formData, "inscricao");
    }

    // Confere se os clienteId enviados (locatário ou proprietário) realmente
    // existem.
    const idsExistentes = [...locatariosForm, ...proprietariosForm]
      .map((c) => c.clienteId)
      .filter((id): id is string => Boolean(id));
    const clientesExistentes =
      idsExistentes.length > 0
        ? await prisma.clientes.findMany({ where: { id: { in: idsExistentes } } })
        : [];
    const clientesExistentesPorId = new Map(clientesExistentes.map((c) => [c.id, c]));
    for (const id of idsExistentes) {
      if (!clientesExistentesPorId.has(id)) {
        return { ok: false, erro: "Um dos clientes selecionados não foi encontrado — atualize a página e tente de novo." };
      }
    }

    // Antes de criar qualquer cliente novo, confere duplicidade (mesmo nome
    // ou mesmo CPF/CNPJ) — evita duplicar cliente que outro corretor já
    // cadastrou.
    const todosNovos = [...locatariosForm, ...proprietariosForm].filter((c) => !c.clienteId);
    for (const c of todosNovos) {
      const duplicado = await buscarClienteDuplicado({ nome: c.nome, cpfCnpj: c.cpfCnpj, ignorarIds: idsExistentes });
      if (duplicado) {
        return { ok: false, erro: mensagemClienteDuplicado(duplicado) };
      }
    }

    const locatariosCriados = await Promise.all(
      locatariosForm.filter((c) => !c.clienteId).map((c) => criarCliente(c, session.parceiroId))
    ).catch((erro) => registrarEJogarErro({ entidadeTipo: "clientes", acao: "criar_locatario_via_portal", erro }));

    const proprietariosCriados = await Promise.all(
      proprietariosForm.filter((c) => !c.clienteId).map((c) => criarCliente(c, session.parceiroId))
    ).catch((erro) => registrarEJogarErro({ entidadeTipo: "clientes", acao: "criar_proprietario_via_portal", erro }));

    function remontar(lista: ClienteDigitado[], criados: typeof locatariosCriados) {
      let proximoNovo = 0;
      return lista.map((c) => {
        if (c.clienteId) return clientesExistentesPorId.get(c.clienteId)!;
        const criado = criados[proximoNovo];
        proximoNovo += 1;
        return criado;
      });
    }

    const locatariosResultado = remontar(locatariosForm, locatariosCriados);
    const locatarioIds = locatariosResultado.map((c) => c.id);

    let imovelId: string;
    let corretorProprietarioAuto: string | null = null;
    let statusTransacao: string;

    if (admImovelId) {
      // Via administração — precisa estar Ativa (checagem no servidor, não
      // confia só no que o formulário mandou).
      const administracao = await prisma.adm_imoveis.findFirst({
        where: { id: admImovelId, status: "Ativo", excluido: false }
      });
      if (!administracao) {
        return {
          ok: false,
          erro: "A administração selecionada não está mais com status Ativo — atualize a página e tente de novo."
        };
      }
      imovelId = administracao.imovel_id;
      corretorProprietarioAuto = administracao.parceiro_id;
      statusTransacao = STATUS_LOCACAO_OPCOES[0]; // "Elaboração de Contrato de Locação"
    } else if (imovelIdExistente) {
      const imovelExistente = await prisma.imoveis.findFirst({ where: { id: imovelIdExistente, excluido: false } });
      if (!imovelExistente) {
        return { ok: false, erro: "O imóvel selecionado não foi encontrado — atualize a página e tente de novo." };
      }
      // Reconfere no servidor que este imóvel não tem uma administração
      // ativa — esse caso precisa passar pela opção "via administração".
      const admAtivaDoImovel = await prisma.adm_imoveis.findFirst({
        where: { imovel_id: imovelIdExistente, status: "Ativo", excluido: false }
      });
      if (admAtivaDoImovel) {
        return {
          ok: false,
          erro: "Este imóvel já tem uma administração Ativa — selecione-a em vez de cadastrar sem administração."
        };
      }
      imovelId = imovelIdExistente;
      corretorProprietarioAuto = imovelExistente.parceiro_id;
      statusTransacao = STATUS_LOCACAO_OPCOES[1]; // "Imóvel em locação sem administração"
    } else {
      const proprietariosResultado = remontar(proprietariosForm, proprietariosCriados);
      const [cidade, estado] = await Promise.all([
        cidadeIdNovo ? prisma.cidades.findUnique({ where: { id: cidadeIdNovo } }) : Promise.resolve(null),
        estadoIdNovo ? prisma.estados.findUnique({ where: { id: estadoIdNovo } }) : Promise.resolve(null)
      ]);
      const enderecoCompletoNovo = [
        [ruaNovo, nPredialNovo].filter(Boolean).join(", ") || null,
        complementoNovo,
        bairroNovo,
        cidade?.nome ?? null,
        estado?.nome ?? null
      ]
        .filter((p): p is string => Boolean(p))
        .join(" - ");

      const novoImovel = await prisma.imoveis
        .create({
          data: {
            tipo_imovel: tipoImovelNovo!,
            rua: ruaNovo!,
            n_predial: nPredialNovo,
            complemento: complementoNovo,
            bairro: bairroNovo,
            cidade_id: cidadeIdNovo,
            estado_id: estadoIdNovo,
            endereco: enderecoCompletoNovo || null,
            matricula: matriculaNovo,
            inscricao: inscricaoNovo,
            parceiro_id: session.parceiroId,
            imoveis_proprietarios: {
              create: proprietariosResultado.map((c, ordem) => ({ cliente_id: c.id, ordem }))
            }
          }
        })
        .catch((erro) => registrarEJogarErro({ entidadeTipo: "imoveis", acao: "criar_via_portal_locacao", erro }));

      imovelId = novoImovel.id;
      corretorProprietarioAuto = session.parceiroId;
      statusTransacao = STATUS_LOCACAO_OPCOES[1]; // "Imóvel em locação sem administração"
    }

    const proprietarioId = await proprietarioDoImovel(imovelId);
    if (!proprietarioId) {
      return {
        ok: false,
        erro: "O imóvel não tem nenhum proprietário cadastrado — não dá pra gerar a transação."
      };
    }

    const dataAssinatura = data(formData, "data_assinatura") ?? new Date();
    const prazoContratoMeses = inteiro(formData, "prazo_contrato_meses");
    const diaVencimento = inteiro(formData, "dia_vencimento");
    const dataVencimentoForm = data(formData, "data_vencimento");
    const dataVencimentoCalc =
      dataVencimentoForm ??
      (prazoContratoMeses
        ? (() => {
            const iso = somarMeses(dataAssinatura.toISOString().slice(0, 10), prazoContratoMeses);
            return iso ? new Date(iso + "T00:00:00") : null;
          })()
        : null);

    const valorTransacaoTxt = texto(formData, "valor_transacao");
    const valorTransacao = valorTransacaoTxt ? valorEditavelParaDecimal(valorTransacaoTxt) ?? 0 : 0;

    const finalidadeLocacao = texto(formData, "finalidade_locacao");
    const garantia = texto(formData, "garantia");
    const valorCaucaoTxt = texto(formData, "valor_caucao");
    const valorCaucao = valorCaucaoTxt ? valorEditavelParaDecimal(valorCaucaoTxt) : null;
    const pgCaucao = texto(formData, "pg_caucao");
    const formaPagamento = texto(formData, "forma_pagamento");
    const encargos = formData.getAll("encargos").map((v) => String(v));

    const porcHonorarioTxt = texto(formData, "porc_honorario");
    const porcHonorario = porcHonorarioTxt ? percentualParaDecimal(porcHonorarioTxt) ?? 0 : 0;
    const temParceria = booleano(formData, "tem_parceria");
    const parceiroExternoId = texto(formData, "parceiro_externo_id");
    const porcParceriaTxt = texto(formData, "porc_parceria");
    const porcParceria = temParceria && porcParceriaTxt ? percentualParaDecimal(porcParceriaTxt) : null;

    const corretorProprietarioId = texto(formData, "corretor_proprietario_id") ?? corretorProprietarioAuto;
    const corretorContraparteId = texto(formData, "corretor_contraparte_id");

    const idLegado = await gerarProximoIdLocacao();

    const novo = await prisma.transacoes
      .create({
        data: {
          tipo: "Locação",
          id_legado: idLegado,
          loja_id: lojaId,
          adm_imovel_id: admImovelId || null,
          imovel_id: imovelId,
          cliente_id: proprietarioId,
          cliente_contraparte_id: locatarioIds[0],
          status: statusTransacao,
          data_assinatura: dataAssinatura,
          data_vencimento: dataVencimentoCalc,
          dia_vencimento: diaVencimento,
          prazo_contrato_meses: prazoContratoMeses,
          valor_transacao: valorTransacao,
          finalidade_locacao: finalidadeLocacao,
          garantia,
          valor_caucao: valorCaucao,
          pg_caucao: pgCaucao,
          forma_pagamento: formaPagamento,
          encargos,
          porc_honorario: porcHonorario,
          tem_parceria: temParceria,
          porc_parceria: porcParceria,
          parceiro_externo_id: temParceria ? parceiroExternoId : null,
          corretor_proprietario_id: corretorProprietarioId,
          corretor_contraparte_id: corretorContraparteId,
          criado_no_portal: true
        }
      })
      .catch((erro) => registrarEJogarErro({ entidadeTipo: "transacoes", acao: "criar_locacao_via_portal", erro }));

    await prisma.transacoes_contrapartes.createMany({
      data: locatarioIds.map((clienteId, ordem) => ({ transacao_id: novo.id, cliente_id: clienteId, ordem }))
    });

    // A administração passa sozinha de Ativo para Locado — só se ainda
    // estiver Ativo (updateMany condicional evita sobrescrever um status já
    // mudado por outra locação/ação enquanto esta rodava).
    if (admImovelId) {
      await prisma.adm_imoveis.updateMany({
        where: { id: admImovelId, status: "Ativo" },
        data: { status: "Locado", updated_at: new Date() }
      });
    }

    await logAlteracaoPortal({
      parceiroId: session.parceiroId,
      entidadeTipo: "transacoes",
      entidadeId: novo.id,
      acao: "gerar_locacao",
      dadosDepois: {
        id_legado: novo.id_legado,
        imovel_id: imovelId,
        adm_imovel_id: admImovelId || null,
        locatarios: locatarioIds
      }
    });

    const [imovelInfo, proprietarioInfo, locatariosInfo, lojaInfo] = await Promise.all([
      prisma.imoveis.findUnique({ where: { id: imovelId }, select: { endereco: true } }),
      prisma.clientes.findUnique({ where: { id: proprietarioId }, select: { nome: true } }),
      prisma.clientes.findMany({ where: { id: { in: locatarioIds } }, select: { nome: true } }),
      prisma.lojas.findUnique({ where: { id: lojaId }, select: { nome: true } })
    ]);

    const documentosEnviados = parseDocumentos(formData);
    const linksDocumentosHtml = await montarLinksDocumentos(documentosEnviados);
    const anexosDocumentos = await montarAnexosDocumentos(documentosEnviados);

    const linhasResumo = [
      `<strong>Id:</strong> ${novo.id_legado ?? novo.id}`,
      `<strong>Loja:</strong> ${lojaInfo?.nome ?? "—"}`,
      `<strong>Corretor que cadastrou:</strong> ${session.nome}`,
      `<strong>Imóvel:</strong> ${imovelInfo?.endereco ?? "—"}`,
      `<strong>Origem:</strong> ${
        admImovelId ? "Através de Administração (status passou de Ativo para Locado)" : "Sem administração"
      }`,
      `<strong>Cliente proprietário:</strong> ${proprietarioInfo?.nome ?? "—"}`,
      `<strong>Locatário(s):</strong> ${locatariosInfo.map((c) => c.nome).join(", ") || "—"}`,
      `<strong>Valor do aluguel:</strong> ${formatMoeda(valorTransacao)}`,
      `<strong>Data de assinatura:</strong> ${formatData(dataAssinatura)}`,
      `<strong>Honorário informado pelo corretor:</strong> ${porcHonorario ? `${(porcHonorario * 100).toFixed(2)}%` : "—"}`
    ];

    const html = `
      <div style="font-family: sans-serif; font-size: 14px; color: #1f2937;">
        <p>Nova <strong>Elaboração de Locação</strong> cadastrada pelo portal do corretor.</p>
        <p>${linhasResumo.join("<br/>")}</p>
        ${linksDocumentosHtml}
        <p style="color:#6b7280; font-size:12px;">A divisão do comissionamento entre os corretores ainda precisa ser preenchida no administrativo.</p>
      </div>
    `;

    const resultadoEmail = await enviarEmail({
      to: process.env.EMAIL_ADM_LOCACAO || EMAIL_DESTINO_PADRAO,
      subject: `Locação ${novo.id_legado ?? ""} — ${imovelInfo?.endereco ?? "imóvel sem endereço"}`,
      html,
      attachments: anexosDocumentos
    });

    if (!resultadoEmail.ok) {
      await registrarEJogarErro({
        entidadeTipo: "transacoes",
        entidadeId: novo.id,
        acao: "enviar_email_locacao",
        erro: new Error(resultadoEmail.erro)
      }).catch(() => undefined);
    }

    return {
      ok: true,
      idLegado: novo.id_legado,
      emailEnviado: resultadoEmail.ok,
      emailErro: resultadoEmail.ok ? undefined : resultadoEmail.erro
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return { ok: false, erro: mensagem };
  }
}
