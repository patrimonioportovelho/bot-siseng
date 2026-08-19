"use server";

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { logAlteracaoPortal } from "@/lib/auth";
import { valorEditavelParaDecimal, percentualParaDecimal, formatMoeda, formatData } from "@/lib/format";
import { registrarEJogarErro } from "@/lib/erros";
import { buscarClienteDuplicado, mensagemClienteDuplicado } from "@/lib/clientes/duplicidade";
import { validarCpfCnpj } from "@/lib/clientes/validacao";
import { montarEnderecoPF } from "@/lib/clientes/endereco";
import { gerarProximoIdCliente, criarClientesEmSequencia } from "@/lib/clientes/id-legado";
import { enviarEmail, type EmailAnexo } from "@/lib/email";
import { criarUploadAssinadoDocumento, criarLinkDownloadDocumento, baixarDocumentoPortal } from "@/lib/supabase-admin";

const EMAIL_DESTINO_PADRAO = "engimob@remax.com.br";

// Mesmo motivo do Contrato de Compra e Venda/Locação (ver comentário lá):
// documento nunca passa pela Server Action de cadastro — a Vercel tem um
// limite FIXO de 4,5MB por requisição de função. O navegador chama esta
// action só pra pedir uma URL de upload assinada, sobe o arquivo direto pro
// Supabase, e manda pra cadastrarAdministracaoAction só o caminho já salvo.
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

function valorMonetario(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  return t ? valorEditavelParaDecimal(t) : null;
}

function percentual(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  return t ? percentualParaDecimal(t) : null;
}

function booleano(formData: FormData, campo: string): boolean {
  return formData.get(campo) === "on" || formData.get(campo) === "true";
}

// Um cliente do formulário — ou já cadastrado deste corretor (clienteId
// presente, reaproveitado sem edição), ou novo (digitado na hora). Mesmo
// padrão do Contrato de Gestão: pode ter mais de um proprietário (herdeiros,
// casal em comunhão etc.) — a ordem em que aparecem aqui é a mesma ordem de
// qualificação/assinatura no contrato de administração.
type ClienteDigitado = {
  clienteId?: string;
  tipoCliente: string;
  nome: string;
  rg: string;
  expedicao: string;
  cpfCnpj: string;
  sexo: string;
  dataNascimento: string;
  endereco: string;
  cep: string;
  rua: string;
  nPredial: string;
  complemento: string;
  bairro: string;
  estadoId: string;
  cidadeId: string;
  nomeMae: string;
  nomePai: string;
  nacionalidade: string;
  estadoCivil: string;
  uniaoEstavel: string;
  profissao: string;
  catProfissao: string;
  tipoServidor: string;
  rendaBruta: string;
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

// "" (não perguntado) vira NULL, "true"/"false" viram booleano de verdade —
// usado no campo uniao_estavel (só existe quando estado_civil pede).
function booleanoTri(v: string): boolean | null {
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

function parseClientes(formData: FormData): ClienteDigitado[] {
  const bruto = texto(formData, "clientesJson");
  if (!bruto) return [];
  try {
    const lista = JSON.parse(bruto);
    if (!Array.isArray(lista)) return [];
    return lista
      .map((c) => ({
        clienteId: typeof c?.clienteId === "string" && c.clienteId.length > 0 ? c.clienteId : undefined,
        tipoCliente: String(c?.tipoCliente ?? "").trim(),
        nome: String(c?.nome ?? "").trim(),
        rg: String(c?.rg ?? "").trim(),
        expedicao: String(c?.expedicao ?? "").trim(),
        cpfCnpj: String(c?.cpfCnpj ?? "").trim(),
        sexo: String(c?.sexo ?? "").trim(),
        dataNascimento: String(c?.dataNascimento ?? "").trim(),
        endereco: String(c?.endereco ?? "").trim(),
        cep: String(c?.cep ?? "").trim(),
        rua: String(c?.rua ?? "").trim(),
        nPredial: String(c?.nPredial ?? "").trim(),
        complemento: String(c?.complemento ?? "").trim(),
        bairro: String(c?.bairro ?? "").trim(),
        estadoId: String(c?.estadoId ?? "").trim(),
        cidadeId: String(c?.cidadeId ?? "").trim(),
        nomeMae: String(c?.nomeMae ?? "").trim(),
        nomePai: String(c?.nomePai ?? "").trim(),
        nacionalidade: String(c?.nacionalidade ?? "").trim(),
        estadoCivil: String(c?.estadoCivil ?? "").trim(),
        uniaoEstavel: String(c?.uniaoEstavel ?? "").trim(),
        profissao: String(c?.profissao ?? "").trim(),
        catProfissao: String(c?.catProfissao ?? "").trim(),
        tipoServidor: String(c?.tipoServidor ?? "").trim(),
        rendaBruta: String(c?.rendaBruta ?? "").trim(),
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

// Valida CPF/CNPJ (dígito verificador) de todos os clientes novos do
// formulário antes de criar qualquer um.
function validarDocumentos(clientesNovos: ClienteDigitado[]): string | null {
  for (const c of clientesNovos) {
    if (!c.cpfCnpj) continue;
    const erro = validarCpfCnpj(c.cpfCnpj);
    if (erro) return `${c.nome || "Cliente"}: ${erro}`;
  }
  return null;
}

// Tipo de cliente, Nome, CPF/CNPJ, Sexo (PF) e Telefone obrigatórios em todo
// cliente novo (pedido do usuário, 09/08/2026 — "alinhamento do cadastro de
// cliente em todos os pontos de entrada"). Ver mesmo comentário em
// app/portal/gestao/actions.ts.
function validarCamposObrigatorios(clientesNovos: ClienteDigitado[]): string | null {
  for (const c of clientesNovos) {
    if (!c.tipoCliente) return `${c.nome || "Cliente"}: tipo de cliente é obrigatório.`;
    if (!c.cpfCnpj) return `${c.nome}: ${c.tipoCliente === "Pessoa Jurídica" ? "CNPJ" : "CPF"} é obrigatório.`;
    if (c.tipoCliente !== "Pessoa Jurídica" && !c.sexo) return `${c.nome}: sexo é obrigatório.`;
    if (!c.telefone) return `${c.nome}: telefone é obrigatório.`;
  }
  return null;
}

// Mesmo esquema de numeração do admin (ADM-0001, ADM-0002...) — as duas
// origens (admin e portal) escrevem na mesma tabela adm_imoveis, então o
// próximo número sempre olha pra todos os registros com esse prefixo, não só
// os criados por aqui.
async function gerarProximoIdAdm(): Promise<string> {
  const registros = await prisma.adm_imoveis.findMany({
    where: { id_legado: { startsWith: "ADM-" } },
    select: { id_legado: true }
  });

  let maior = 0;
  for (const r of registros) {
    const n = Number(r.id_legado?.replace("ADM-", ""));
    if (Number.isFinite(n) && n > maior) maior = n;
  }

  return `ADM-${String(maior + 1).padStart(4, "0")}`;
}

// Cadastra a Administração a partir do portal do corretor: mesmo padrão do
// Contrato de Gestão pra cliente(s)/imóvel (reaproveita cadastro existente
// quando escolhido, cria os que forem realmente novos, com a mesma checagem
// de duplicidade), mas usando o cadastro de Administração de verdade
// (adm_imoveis), com os mesmos campos do formulário "Nova administração" do
// administrativo.
//
// Igual a Compra e Venda e Locação, o corretor NÃO gera o contrato pra
// assinatura por aqui — só cadastra, sobe os documentos de apoio (RG,
// matrícula, print de vistoria etc.) e o administrativo recebe um email de
// aviso com tudo anexado. Quem decide status (Ativo/Locado/Encerrado) e
// gera o contrato de administração de verdade é sempre o administrativo, em
// Documentos. Por isso a administração sempre nasce com status "Captação"
// (primeira coluna do quadro de Administrações), independente do que o
// formulário mandar.
export async function cadastrarAdministracaoAction(
  formData: FormData
): Promise<{ ok: true; idLegado: string | null } | { ok: false; erro: string }> {
  const session = await requirePortalSession();

  try {
    const clientesForm = parseClientes(formData);
    if (clientesForm.length === 0) {
      return { ok: false, erro: "Cadastre ao menos um cliente (proprietário)." };
    }

    const lojaId = texto(formData, "loja_id");
    if (!lojaId) {
      return { ok: false, erro: "Selecione a loja." };
    }

    const tipoImovel = texto(formData, "tipo_imovel");
    const cep = digitos(texto(formData, "cep"));
    const rua = texto(formData, "rua");
    const nPredial = texto(formData, "n_predial");
    const complemento = texto(formData, "complemento");
    const bairro = texto(formData, "bairro");
    const cidadeId = texto(formData, "cidade_id");
    const estadoId = texto(formData, "estado_id");
    const matricula = texto(formData, "matricula");
    const inscricao = texto(formData, "inscricao");
    const imovelIdExistente = texto(formData, "imovel_id");

    if (!tipoImovel || !rua) {
      return { ok: false, erro: "Preencha ao menos o tipo do imóvel e a rua." };
    }

    // Confere que todo clienteId enviado realmente pertence a este corretor
    // (não dá pra reaproveitar cadastro de outro parceiro por aqui) e busca
    // os dados atuais desses clientes já cadastrados.
    const idsExistentes = clientesForm.map((c) => c.clienteId).filter((id): id is string => Boolean(id));
    const clientesExistentes =
      idsExistentes.length > 0
        ? await prisma.clientes.findMany({
            where: { id: { in: idsExistentes }, parceiro_id: session.parceiroId }
          })
        : [];
    const clientesExistentesPorId = new Map(clientesExistentes.map((c) => [c.id, c]));

    for (const id of idsExistentes) {
      if (!clientesExistentesPorId.has(id)) {
        return { ok: false, erro: "Um dos clientes selecionados não pertence ao seu cadastro." };
      }
    }

    // Antes de criar qualquer cliente novo, confere se já não existe um
    // cadastro igual (mesmo nome ou mesmo CPF/CNPJ) feito por OUTRO corretor
    // — a lista de "cliente já cadastrado" do formulário só mostra os
    // clientes do próprio corretor. Só o administrativo decide se transfere
    // o cliente existente.
    const erroObrigatorio = validarCamposObrigatorios(clientesForm.filter((c) => !c.clienteId));
    if (erroObrigatorio) return { ok: false, erro: erroObrigatorio };

    const erroDocumento = validarDocumentos(clientesForm.filter((c) => !c.clienteId));
    if (erroDocumento) return { ok: false, erro: erroDocumento };

    for (const c of clientesForm) {
      if (c.clienteId) continue;
      const duplicado = await buscarClienteDuplicado({
        nome: c.nome,
        cpfCnpj: c.cpfCnpj,
        ignorarIds: idsExistentes
      });
      if (duplicado) {
        return { ok: false, erro: mensagemClienteDuplicado(duplicado) };
      }
    }

    // Cria só os clientes que realmente são novos (sem clienteId); os
    // demais são só reaproveitados do banco, sem alterar nada neles.
    // Em sequência, não em paralelo — evita duas criações calculando o
    // mesmo próximo CL-0000 ao mesmo tempo (ver comentário em
    // lib/clientes/id-legado.ts#criarClientesEmSequencia).
    const clientesCriados = await criarClientesEmSequencia(
      clientesForm.filter((c) => !c.clienteId),
      async (c) => {
          const doc = digitos(c.cpfCnpj);
          const ehCnpj = c.tipoCliente === "Pessoa Jurídica" || (!c.tipoCliente && (doc?.length ?? 0) === 14);

          // Endereço estruturado vale pros dois tipos agora — PF ("Endereço")
          // e PJ ("Sede"), mesmo padrão do cadastro de Clientes do admin
          // (19/08/2026, antes PJ usava só texto livre solto em `endereco`).
          const endereco = await montarEnderecoPF({
            rua: c.rua || null,
            nPredial: c.nPredial || null,
            complemento: c.complemento || null,
            bairro: c.bairro || null,
            cidadeId: c.cidadeId || null,
            estadoId: c.estadoId || null
          });
          const dataNasc = c.dataNascimento ? new Date(c.dataNascimento) : null;

          return prisma.clientes.create({
            data: {
              nome: c.nome,
              id_legado: await gerarProximoIdCliente(),
              tipo_cliente: ehCnpj ? "Pessoa Jurídica" : "Pessoa Física",
              rg: !ehCnpj ? c.rg || null : null,
              expedicao: !ehCnpj ? c.expedicao || null : null,
              cpf: !ehCnpj ? doc : null,
              cnpj: ehCnpj ? doc : null,
              sexo: !ehCnpj ? c.sexo || null : null,
              data_nascimento: !ehCnpj && dataNasc && !Number.isNaN(dataNasc.getTime()) ? dataNasc : null,
              nome_mae: !ehCnpj ? c.nomeMae || null : null,
              nome_pai: !ehCnpj ? c.nomePai || null : null,
              cep: digitos(c.cep),
              rua: c.rua || null,
              n_predial: c.nPredial || null,
              complemento: c.complemento || null,
              bairro: c.bairro || null,
              estado_id: c.estadoId || null,
              cidade_id: c.cidadeId || null,
              endereco,
              nacionalidade: c.nacionalidade || null,
              estado_civil: !ehCnpj ? c.estadoCivil || null : null,
              uniao_estavel: !ehCnpj ? booleanoTri(c.uniaoEstavel) : null,
              profissao: !ehCnpj ? c.profissao || null : null,
              cat_profissao: !ehCnpj ? c.catProfissao || null : null,
              tipo_servidor: !ehCnpj ? c.tipoServidor || null : null,
              renda_bruta: !ehCnpj && c.rendaBruta ? valorEditavelParaDecimal(c.rendaBruta) : null,
              email: c.email || null,
              telefone: digitos(c.telefone),
              banco_id: c.bancoId || null,
              codigo_banco: c.codigoBanco || null,
              agencia: c.agencia || null,
              conta: c.conta || null,
              tipo_conta: c.tipoConta || null,
              tipo_pix: c.tipoPix || null,
              pix: c.pix || null,
              parceiro_id: session.parceiroId
            }
          });
        }
    ).catch((erro) => registrarEJogarErro({ entidadeTipo: "clientes", acao: "criar_via_portal_administracao", erro }));

    // Remonta a lista de clientes na mesma ordem em que apareceram no
    // formulário (mistura existentes reaproveitados + recém-criados) — o
    // primeiro da lista vira o cliente principal (dono direto do vínculo em
    // adm_imoveis.cliente_id), os demais entram como proprietários também no
    // imóvel (qualificação/assinatura do contrato).
    let proximoNovo = 0;
    const clientesResultado = clientesForm.map((c) => {
      if (c.clienteId) {
        return clientesExistentesPorId.get(c.clienteId)!;
      }
      const criado = clientesCriados[proximoNovo];
      proximoNovo += 1;
      return criado;
    });

    const principal = clientesResultado[0];

    let imovel: Awaited<ReturnType<typeof prisma.imoveis.create>>;

    if (imovelIdExistente) {
      // Reaproveita um imóvel já cadastrado deste corretor (não edita nada
      // nele) — só garante que todo cliente desse contrato fique vinculado
      // como proprietário, inclusive os que forem novos aqui.
      const imovelExistente = await prisma.imoveis.findFirst({
        where: { id: imovelIdExistente, parceiro_id: session.parceiroId }
      });
      if (!imovelExistente) {
        return { ok: false, erro: "O imóvel selecionado não pertence ao seu cadastro." };
      }
      imovel = imovelExistente;

      await prisma.imoveis_proprietarios.createMany({
        data: clientesResultado.map((c, ordem) => ({ imovel_id: imovel.id, cliente_id: c.id, ordem })),
        skipDuplicates: true
      });
    } else {
      const [cidade, estado] = await Promise.all([
        cidadeId ? prisma.cidades.findUnique({ where: { id: cidadeId } }) : Promise.resolve(null),
        estadoId ? prisma.estados.findUnique({ where: { id: estadoId } }) : Promise.resolve(null)
      ]);
      const enderecoCompletoNovo = [
        [rua, nPredial].filter(Boolean).join(", ") || null,
        complemento,
        bairro,
        cidade?.nome ?? null,
        estado?.nome ?? null
      ]
        .filter((p): p is string => Boolean(p))
        .join(" - ");

      imovel = await prisma.imoveis
        .create({
          data: {
            tipo_imovel: tipoImovel,
            cep,
            rua,
            n_predial: nPredial,
            complemento,
            bairro,
            cidade_id: cidadeId,
            estado_id: estadoId,
            endereco: enderecoCompletoNovo || null,
            matricula,
            inscricao,
            parceiro_id: session.parceiroId,
            imoveis_proprietarios: {
              create: clientesResultado.map((c, ordem) => ({ cliente_id: c.id, ordem }))
            }
          }
        })
        .catch((erro) => registrarEJogarErro({ entidadeTipo: "imoveis", acao: "criar_via_portal_administracao", erro }));
    }

    const idLegado = await gerarProximoIdAdm();

    const novaAdministracao = await prisma.adm_imoveis
      .create({
        data: {
          id_legado: idLegado,
          loja_id: lojaId,
          cliente_id: principal.id,
          imovel_id: imovel.id,
          parceiro_id: session.parceiroId,
          // Status sempre nasce "Captação" — só o administrativo avança pra
          // Ativo/Locado/Encerrado (é inclusive o que "ativa" a administração
          // ao gerar o contrato de verdade, ver lib/documentos/gerar.ts).
          status: "Captação",
          data_entrada: data(formData, "data_entrada"),
          data_assinatura: data(formData, "data_assinatura"),
          prazo_contrato_meses: inteiro(formData, "prazo_contrato_meses"),
          valor_transacao: valorMonetario(formData, "valor_transacao"),
          porc_honorario: percentual(formData, "porc_honorario"),
          tx_administracao: percentual(formData, "tx_administracao"),
          valor_cliente: valorMonetario(formData, "valor_cliente"),
          valor_administracao: valorMonetario(formData, "valor_administracao"),
          iptu: valorMonetario(formData, "iptu"),
          tem_vistoria: booleano(formData, "tem_vistoria"),
          arquivo_vistoria_url: texto(formData, "arquivo_vistoria_url"),
          tem_condominio: booleano(formData, "tem_condominio"),
          condominio: valorMonetario(formData, "condominio"),
          agua: texto(formData, "agua"),
          uc_caerd: texto(formData, "uc_caerd"),
          energia: texto(formData, "energia"),
          uc_energisa: texto(formData, "uc_energisa"),
          observacao: texto(formData, "observacao"),
          pasta_url: texto(formData, "pasta_url")
        }
      })
      .catch((erro) => registrarEJogarErro({ entidadeTipo: "adm_imoveis", acao: "criar_via_portal", erro }));

    await logAlteracaoPortal({
      parceiroId: session.parceiroId,
      entidadeTipo: "adm_imoveis",
      entidadeId: novaAdministracao.id,
      acao: "cadastrar_administracao",
      dadosDepois: { id_legado: novaAdministracao.id_legado, cliente: principal.nome, imovel_id: imovel.id }
    });

    // Email pro administrativo — movido pra depois da resposta ao corretor
    // (after(), do Next.js), mesmo achado do Compra e Venda/Locação (ver
    // comentário completo em app/portal/compra-venda/actions.ts): baixar
    // anexo do Storage + mandar pelo Gmail (SMTP) no fim da função é que
    // empurrava o tempo total pra perto do limite e causava "An unexpected
    // response was received from the server." pro corretor, mesmo com o
    // cadastro já salvo. Falha no envio agora só aparece em Configurações >
    // Erros de cadastro, não trava nem assusta o corretor.
    const documentosEnviados = parseDocumentos(formData);

    after(async () => {
      try {
        const lojaInfo = await prisma.lojas.findUnique({ where: { id: lojaId }, select: { nome: true } });

        const linksDocumentosHtml = await montarLinksDocumentos(documentosEnviados);
        const anexosDocumentos = await montarAnexosDocumentos(documentosEnviados);

        const linhasResumo = [
          `<strong>Id:</strong> ${novaAdministracao.id_legado ?? novaAdministracao.id}`,
          `<strong>Loja:</strong> ${lojaInfo?.nome ?? "—"}`,
          `<strong>Corretor que cadastrou:</strong> ${session.nome}`,
          `<strong>Imóvel:</strong> ${imovel.endereco ?? "—"}`,
          `<strong>Proprietário(s):</strong> ${clientesResultado.map((c) => c.nome).join(", ") || "—"}`,
          `<strong>Valor do aluguel:</strong> ${valorMonetario(formData, "valor_transacao") ? formatMoeda(valorMonetario(formData, "valor_transacao")!) : "—"}`,
          `<strong>Data de assinatura:</strong> ${
            data(formData, "data_assinatura") ? formatData(data(formData, "data_assinatura")!) : "—"
          }`,
          `<strong>Honorário informado pelo corretor:</strong> ${
            percentual(formData, "porc_honorario") ? `${(percentual(formData, "porc_honorario")! * 100).toFixed(2)}%` : "—"
          }`
        ];

        const html = `
          <div style="font-family: sans-serif; font-size: 14px; color: #1f2937;">
            <p>Nova <strong>Administração</strong> cadastrada pelo portal do corretor.</p>
            <p>${linhasResumo.join("<br/>")}</p>
            ${linksDocumentosHtml}
            <p style="color:#6b7280; font-size:12px;">Contrato de administração ainda precisa ser gerado no administrativo (Documentos).</p>
          </div>
        `;

        const resultadoEmail = await enviarEmail({
          to: process.env.EMAIL_ADM_ADMINISTRACAO || EMAIL_DESTINO_PADRAO,
          subject: `Administração ${novaAdministracao.id_legado ?? ""} — ${imovel.endereco ?? "imóvel sem endereço"}`,
          html,
          attachments: anexosDocumentos
        });

        if (!resultadoEmail.ok) {
          await registrarEJogarErro({
            entidadeTipo: "adm_imoveis",
            entidadeId: novaAdministracao.id,
            acao: "enviar_email_administracao",
            erro: new Error(resultadoEmail.erro)
          }).catch(() => undefined);
        }
      } catch (erroEmail) {
        await registrarEJogarErro({
          entidadeTipo: "adm_imoveis",
          entidadeId: novaAdministracao.id,
          acao: "enviar_email_administracao",
          erro: erroEmail instanceof Error ? erroEmail : new Error(String(erroEmail))
        }).catch(() => undefined);
      }
    });

    return { ok: true, idLegado: novaAdministracao.id_legado };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return { ok: false, erro: mensagem };
  }
}
