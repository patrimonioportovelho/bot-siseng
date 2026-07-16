"use server";

import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { logAlteracaoPortal } from "@/lib/auth";
import { valorEditavelParaDecimal, percentualParaDecimal, formatMoeda, formatData } from "@/lib/format";
import { registrarEJogarErro } from "@/lib/erros";
import { STATUS_COMPRA_VENDA_OPCOES } from "@/lib/transacoes/opcoes";
import { buscarGestaoPorImovel } from "@/lib/transacoes/buscas";
import { enviarEmail } from "@/lib/email";
import { buscarClienteDuplicado, mensagemClienteDuplicado } from "@/lib/clientes/duplicidade";
import { criarUploadAssinadoDocumento, criarLinkDownloadDocumento } from "@/lib/supabase-admin";

const EMAIL_DESTINO_PADRAO = "engimob@remax.com.br";

// Prepara um upload direto do navegador pro Supabase Storage — a Vercel tem
// um limite FIXO de 4,5MB por requisição de função (Server Action
// incluída), sem configuração que aumente isso. Documentos escaneados ou
// foto de celular estouram fácil. Por isso os documentos NÃO passam mais
// pela Server Action de cadastro: o navegador chama esta action só pra
// pedir uma URL de upload assinada (chamada minúscula, só o nome do
// arquivo), sobe o arquivo direto pro Supabase, e manda pra
// gerarCompraVendaAction só o caminho já salvo (texto pequeno).
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

// Gera um link de download (7 dias) pra cada documento já enviado — vai no
// corpo do email pro administrativo em vez de anexo de verdade. Além de
// contornar o mesmo limite da Vercel do lado de fora (o corpo do email
// também tem limite no Gmail), o link nem exige que o email chegue rápido:
// o arquivo já está salvo desde o upload, o email é só o aviso.
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

// Um cliente do formulário — comprador ou vendedor(proprietário do imóvel
// novo) — ou já cadastrado (clienteId presente, reaproveitado sem edição),
// ou novo (digitado na hora). Mesmo padrão do Contrato de Administração
// (app/portal/administracao/actions.ts#parseClientes).
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
        telefone: String(c?.telefone ?? "").trim()
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
      parceiro_id: parceiroId
    }
  });
}

// Mesmo esquema de numeração do admin (CV-0001, CV-0002...) — as duas
// origens (admin e portal) escrevem na mesma tabela transacoes, então o
// próximo número sempre olha pra todos os registros com esse prefixo, não só
// os criados por aqui.
async function gerarProximoIdCV(): Promise<string> {
  const registros = await prisma.transacoes.findMany({
    where: { id_legado: { startsWith: "CV-" } },
    select: { id_legado: true }
  });

  let maior = 0;
  for (const r of registros) {
    const n = Number(r.id_legado?.replace("CV-", ""));
    if (Number.isFinite(n) && n > maior) maior = n;
  }

  return `CV-${String(maior + 1).padStart(4, "0")}`;
}

async function sincronizarCondicoesPagamento(transacaoId: string, formData: FormData) {
  const bruto = texto(formData, "condicoes_pagamento_json");
  let lista: Array<Record<string, unknown>> = [];
  if (bruto) {
    try {
      const parsed = JSON.parse(bruto);
      if (Array.isArray(parsed)) lista = parsed;
    } catch {
      lista = [];
    }
  }

  const linhas = lista
    .map((c) => {
      const valor = valorEditavelParaDecimal(String(c.valor ?? "").trim());
      const parcelasTxt = String(c.parcelas ?? "").trim();
      const parcelasNum = parcelasTxt ? Number(parcelasTxt) : NaN;
      const dataTxt = String(c.data_pagamento ?? "").trim();
      const dataPagamento = dataTxt ? new Date(dataTxt) : null;
      return {
        tipo: String(c.tipo ?? "").trim() || null,
        valor,
        forma_pagamento: String(c.forma_pagamento ?? "").trim() || null,
        parcelas: Number.isFinite(parcelasNum) ? Math.trunc(parcelasNum) : null,
        momento: String(c.momento ?? "").trim() || null,
        data_pagamento: dataPagamento && !Number.isNaN(dataPagamento.getTime()) ? dataPagamento : null,
        descricao: String(c.descricao ?? "").trim() || null
      };
    })
    .filter((c): c is typeof c & { valor: number } => c.valor !== null);

  if (linhas.length > 0) {
    await prisma.condicoes_pagamento.createMany({
      data: linhas.map((c) => ({ transacao_id: transacaoId, ...c }))
    });
  }
}

// Gera a "Elaboração de Contrato de Compra e Venda" a partir do portal do
// corretor. Diferente do Contrato de Gestão e da Proposta, aqui não gera
// nenhum documento — só cadastra a transação de verdade (status sempre
// "Elaboração do Contrato de Compra e Venda"), pra o ADM assumir dali pra
// frente (inclusive a divisão do comissionamento entre os corretores, que
// não é preenchida por aqui).
//
// Cliente(s) comprador(es) e — quando o imóvel ainda não existe no sistema —
// o(s) vendedor(es) podem ser cadastrados na hora, com a mesma checagem de
// duplicidade e o mesmo padrão de "reaproveita se já tem clienteId, cria se
// for novo" usado no Contrato de Administração
// (app/portal/administracao/actions.ts).
//
// Se o imóvel escolhido já tem uma Gestão cadastrada, vincula automático
// (gestao_id) e lança uma atividade no quadro dela — sem mudar a coluna do
// Kanban, isso continua manual, o ADM decide quando mover. Se não tiver
// Gestão e não for "compra sem gestão", guarda os dados que o corretor
// souber digitar (historico_gestao_*) só pra comparação — não cria Gestão
// nenhuma.
export async function gerarCompraVendaAction(
  formData: FormData
): Promise<
  | { ok: true; idLegado: string | null; emailEnviado: boolean; emailErro?: string }
  | { ok: false; erro: string }
> {
  const session = await requirePortalSession();

  try {
    const lojaId = texto(formData, "loja_id");
    const imovelIdExistente = texto(formData, "imovel_id");
    const compraSemGestao = booleano(formData, "compra_sem_gestao");

    const compradoresForm = parseClientes(formData, "compradoresJson");
    if (!lojaId) {
      return { ok: false, erro: "Selecione a loja." };
    }
    if (compradoresForm.length === 0) {
      return { ok: false, erro: "Adicione ao menos um cliente comprador." };
    }

    // Só pede vendedor(es) + dados do imóvel quando o imóvel é novo — se já
    // existe, o(s) proprietário(s) cadastrado(s) nele é que valem.
    let vendedoresForm: ClienteDigitado[] = [];
    let tipoImovelNovo: string | null = null;
    let ruaNovo: string | null = null;
    let nPredialNovo: string | null = null;
    let complementoNovo: string | null = null;
    let bairroNovo: string | null = null;
    let cidadeIdNovo: string | null = null;
    let estadoIdNovo: string | null = null;
    let matriculaNovo: string | null = null;
    let inscricaoNovo: string | null = null;

    if (!imovelIdExistente) {
      vendedoresForm = parseClientes(formData, "vendedoresJson");
      if (vendedoresForm.length === 0) {
        return { ok: false, erro: "Cadastre ao menos um vendedor (proprietário) do imóvel novo." };
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

    // Confere se os clienteId enviados (comprador ou vendedor) realmente
    // existem — o formulário só oferece IDs vindos de uma busca real, mas
    // não custa nada confirmar antes de gravar qualquer coisa.
    const idsExistentes = [...compradoresForm, ...vendedoresForm]
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

    // Antes de criar qualquer cliente novo (comprador ou vendedor), confere
    // se já não existe um cadastro igual (mesmo nome ou mesmo CPF/CNPJ) —
    // evita duplicar cliente que outro corretor já cadastrou. Só o
    // administrativo decide se transfere o cliente existente.
    const todosNovos = [...compradoresForm, ...vendedoresForm].filter((c) => !c.clienteId);
    for (const c of todosNovos) {
      const duplicado = await buscarClienteDuplicado({ nome: c.nome, cpfCnpj: c.cpfCnpj, ignorarIds: idsExistentes });
      if (duplicado) {
        return { ok: false, erro: mensagemClienteDuplicado(duplicado) };
      }
    }

    const compradoresCriados = await Promise.all(
      compradoresForm.filter((c) => !c.clienteId).map((c) => criarCliente(c, session.parceiroId))
    ).catch((erro) => registrarEJogarErro({ entidadeTipo: "clientes", acao: "criar_comprador_via_portal", erro }));

    const vendedoresCriados = await Promise.all(
      vendedoresForm.filter((c) => !c.clienteId).map((c) => criarCliente(c, session.parceiroId))
    ).catch((erro) => registrarEJogarErro({ entidadeTipo: "clientes", acao: "criar_vendedor_via_portal", erro }));

    // Remonta as listas na mesma ordem em que apareceram no formulário
    // (mistura existentes reaproveitados + recém-criados).
    function remontar(lista: ClienteDigitado[], criados: typeof compradoresCriados) {
      let proximoNovo = 0;
      return lista.map((c) => {
        if (c.clienteId) return clientesExistentesPorId.get(c.clienteId)!;
        const criado = criados[proximoNovo];
        proximoNovo += 1;
        return criado;
      });
    }

    const compradoresResultado = remontar(compradoresForm, compradoresCriados);
    const compradorIds = compradoresResultado.map((c) => c.id);

    const primeiroProprietario: { id: string } | null = imovelIdExistente
      ? await prisma.imoveis_proprietarios
          .findFirst({ where: { imovel_id: imovelIdExistente }, orderBy: { ordem: "asc" }, select: { cliente_id: true } })
          .then((r) => (r ? { id: r.cliente_id } : null))
      : null;

    let imovelId: string;
    let vendedorPrincipalId: string;

    if (imovelIdExistente) {
      if (!primeiroProprietario) {
        return {
          ok: false,
          erro: "O imóvel selecionado não tem proprietário cadastrado — não dá pra gerar a transação."
        };
      }
      imovelId = imovelIdExistente;
      vendedorPrincipalId = primeiroProprietario.id;
    } else {
      const vendedoresResultado = remontar(vendedoresForm, vendedoresCriados);
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
              create: vendedoresResultado.map((c, ordem) => ({ cliente_id: c.id, ordem }))
            }
          }
        })
        .catch((erro) => registrarEJogarErro({ entidadeTipo: "imoveis", acao: "criar_via_portal_compra_venda", erro }));

      imovelId = novoImovel.id;
      vendedorPrincipalId = vendedoresResultado[0].id;
    }

    // Vínculo com a Gestão — reconfere no servidor (não confia só no que
    // veio do formulário) qual é a gestão ativa desse imóvel agora. Imóvel
    // recém-criado nunca tem gestão ainda, então isso só encontra algo
    // quando o imóvel já existia.
    let gestaoId: string | null = null;
    let historicoData: Date | null = null;
    let historicoPrazoMeses: number | null = null;
    let historicoValor: number | null = null;

    if (!compraSemGestao) {
      const gestaoExistente = await buscarGestaoPorImovel(imovelId);
      if (gestaoExistente) {
        gestaoId = gestaoExistente.id;
      } else {
        historicoData = data(formData, "historico_gestao_data_assinatura");
        historicoPrazoMeses = inteiro(formData, "historico_gestao_prazo_meses");
        const historicoValorTxt = texto(formData, "historico_gestao_valor");
        historicoValor = historicoValorTxt ? valorEditavelParaDecimal(historicoValorTxt) : null;
      }
    }

    const valorTransacaoTxt = texto(formData, "valor_transacao");
    const valorTransacao = valorTransacaoTxt ? valorEditavelParaDecimal(valorTransacaoTxt) ?? 0 : 0;
    const dataAssinatura = data(formData, "data_assinatura") ?? new Date();
    const chave = texto(formData, "chave");

    const porcHonorarioTxt = texto(formData, "porc_honorario");
    const porcHonorario = porcHonorarioTxt ? percentualParaDecimal(porcHonorarioTxt) ?? 0 : 0;
    const temParceria = booleano(formData, "tem_parceria");
    const parceiroExternoId = texto(formData, "parceiro_externo_id");
    const porcParceriaTxt = texto(formData, "porc_parceria");
    const porcParceria = temParceria && porcParceriaTxt ? percentualParaDecimal(porcParceriaTxt) : null;

    const corretorProprietarioId = texto(formData, "corretor_proprietario_id");
    const corretorContraparteId = texto(formData, "corretor_contraparte_id");

    const idLegado = await gerarProximoIdCV();

    const novo = await prisma.transacoes
      .create({
        data: {
          tipo: "Compra e Venda",
          id_legado: idLegado,
          loja_id: lojaId,
          imovel_id: imovelId,
          cliente_id: vendedorPrincipalId,
          cliente_contraparte_id: compradorIds[0],
          status: STATUS_COMPRA_VENDA_OPCOES[0],
          data_assinatura: dataAssinatura,
          valor_transacao: valorTransacao,
          chave,
          porc_honorario: porcHonorario,
          tem_parceria: temParceria,
          porc_parceria: porcParceria,
          parceiro_externo_id: temParceria ? parceiroExternoId : null,
          corretor_proprietario_id: corretorProprietarioId,
          corretor_contraparte_id: corretorContraparteId,
          gestao_id: gestaoId,
          compra_sem_gestao: compraSemGestao,
          historico_gestao_data_assinatura: historicoData,
          historico_gestao_prazo_meses: historicoPrazoMeses,
          historico_gestao_valor: historicoValor,
          criado_no_portal: true
        }
      })
      .catch((erro) => registrarEJogarErro({ entidadeTipo: "transacoes", acao: "criar_via_portal", erro }));

    await prisma.transacoes_contrapartes.createMany({
      data: compradorIds.map((clienteId, ordem) => ({ transacao_id: novo.id, cliente_id: clienteId, ordem }))
    });

    await sincronizarCondicoesPagamento(novo.id, formData);

    // Atividade no quadro de atividades da Gestão — só quando a transação
    // ficou vinculada a uma. A coluna/Kanban da Gestão não muda sozinha.
    if (gestaoId) {
      await prisma.gestao_atividades.create({
        data: {
          gestao_id: gestaoId,
          tipo: "compra_venda_iniciada",
          titulo: `Elaboração de Contrato de Compra e Venda iniciada (${idLegado})`,
          data: dataAssinatura,
          feito: false
        }
      });
    }

    await logAlteracaoPortal({
      parceiroId: session.parceiroId,
      entidadeTipo: "transacoes",
      entidadeId: novo.id,
      acao: "gerar_compra_venda",
      dadosDepois: { id_legado: novo.id_legado, imovel_id: imovelId, compradores: compradorIds, gestao_id: gestaoId }
    });

    // Email pro administrativo — resumo da transação + a documentação que o
    // corretor já tiver anexado (o resto, se faltar algo, é reunido depois
    // por fora). Isso é best-effort: se o envio falhar (ex.: Gmail fora do
    // ar ou senha de app inválida), a transação já está salva do mesmo
    // jeito — só avisa o corretor pra reportar por outro canal.
    const [imovelInfo, vendedorInfo, compradoresInfo, lojaInfo] = await Promise.all([
      prisma.imoveis.findUnique({ where: { id: imovelId }, select: { endereco: true } }),
      prisma.clientes.findUnique({ where: { id: vendedorPrincipalId }, select: { nome: true } }),
      prisma.clientes.findMany({ where: { id: { in: compradorIds } }, select: { nome: true } }),
      prisma.lojas.findUnique({ where: { id: lojaId }, select: { nome: true } })
    ]);

    const documentosEnviados = parseDocumentos(formData);
    const linksDocumentosHtml = await montarLinksDocumentos(documentosEnviados);

    const linhasResumo = [
      `<strong>Id:</strong> ${novo.id_legado ?? novo.id}`,
      `<strong>Loja:</strong> ${lojaInfo?.nome ?? "—"}`,
      `<strong>Corretor que cadastrou:</strong> ${session.nome}`,
      `<strong>Imóvel:</strong> ${imovelInfo?.endereco ?? "—"}${!imovelIdExistente ? " (imóvel novo, cadastrado agora)" : ""}`,
      `<strong>Cliente vendedor:</strong> ${vendedorInfo?.nome ?? "—"}`,
      `<strong>Cliente(s) comprador(es):</strong> ${compradoresInfo.map((c) => c.nome).join(", ") || "—"}`,
      `<strong>Valor da transação:</strong> ${formatMoeda(valorTransacao)}`,
      `<strong>Data de assinatura:</strong> ${formatData(dataAssinatura)}`,
      `<strong>Momento de entrega das chaves:</strong> ${chave ?? "—"}`,
      `<strong>Honorário informado pelo corretor:</strong> ${porcHonorario ? `${(porcHonorario * 100).toFixed(2)}%` : "—"}`,
      compraSemGestao
        ? "<strong>Gestão:</strong> compra sem gestão (venda direta)"
        : gestaoId
        ? "<strong>Gestão:</strong> vinculada automaticamente a uma gestão já cadastrada"
        : historicoData || historicoPrazoMeses || historicoValor
        ? `<strong>Gestão antiga (não cadastrada):</strong> assinatura ${historicoData ? formatData(historicoData) : "—"}, prazo ${historicoPrazoMeses ?? "—"} meses, valor da época ${historicoValor ? formatMoeda(historicoValor) : "—"}`
        : "<strong>Gestão:</strong> nenhuma encontrada e nenhum dado histórico informado"
    ];

    const html = `
      <div style="font-family: sans-serif; font-size: 14px; color: #1f2937;">
        <p>Nova <strong>Elaboração de Compra e Venda</strong> cadastrada pelo portal do corretor.</p>
        <p>${linhasResumo.join("<br/>")}</p>
        ${linksDocumentosHtml}
        <p style="color:#6b7280; font-size:12px;">A divisão do comissionamento entre os corretores ainda precisa ser preenchida no administrativo.</p>
      </div>
    `;

    const resultadoEmail = await enviarEmail({
      to: process.env.EMAIL_ADM_COMPRA_VENDA || EMAIL_DESTINO_PADRAO,
      subject: `Compra e Venda ${novo.id_legado ?? ""} — ${imovelInfo?.endereco ?? "imóvel sem endereço"}`,
      html
    });

    if (!resultadoEmail.ok) {
      await registrarEJogarErro({
        entidadeTipo: "transacoes",
        entidadeId: novo.id,
        acao: "enviar_email_compra_venda",
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
