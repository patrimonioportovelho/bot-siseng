"use server";

import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { logAlteracaoPortal } from "@/lib/auth";
import { valorEditavelParaDecimal, percentualParaDecimal } from "@/lib/format";
import { gerarDocumento } from "@/lib/documentos/gerar";
import { registrarEJogarErro } from "@/lib/erros";

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

// Um cliente do formulário do portal — ou é um cadastro já existente
// (clienteId presente, escolhido na lista "Cliente já cadastrado"), ou é um
// cliente novo digitado na hora. Cliente existente nunca é editado por
// aqui — só reaproveitado, pra evitar duplicidade (era o que gerava o mesmo
// cliente 3x quando o corretor sempre digitava de novo).
type ClienteDigitado = {
  clienteId?: string;
  nome: string;
  rg: string;
  cpfCnpj: string;
  endereco: string;
  nacionalidade: string;
  estadoCivil: string;
  email: string;
  telefone: string;
};

function parseClientes(formData: FormData): ClienteDigitado[] {
  const bruto = texto(formData, "clientesJson");
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
        email: String(c?.email ?? "").trim(),
        telefone: String(c?.telefone ?? "").trim()
      }))
      .filter((c) => c.clienteId || c.nome.length > 0);
  } catch {
    return [];
  }
}

// Gera o Contrato de Gestão a partir do formulário do portal: reaproveita
// cliente(s)/imóvel já cadastrados quando escolhidos na lista (evita criar
// duplicata do mesmo nome a cada contrato novo — cadastro existente nunca é
// editado por aqui, só vinculado), cria os que forem realmente novos, cria o
// registro de Gestão (Captação Exclusiva, primeira coluna do quadro de
// Gestões em Atividades) com uma atividade já agendada de vencimento do
// contrato, gera o .docx (reaproveitando o mesmo pipeline de
// app/configuracoes) e registra tudo em logs_acesso/logs_alteracao para
// auditoria.
export async function gerarContratoGestaoAction(
  formData: FormData
): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
  const session = await requirePortalSession();

  try {
    const clientesForm = parseClientes(formData);
    if (clientesForm.length === 0) {
      return { ok: false, erro: "Cadastre ao menos um cliente." };
    }

    const tipoImovel = texto(formData, "tipo_imovel");
    const rua = texto(formData, "rua");
    const nPredial = texto(formData, "n_predial");
    const complemento = texto(formData, "complemento");
    const bairro = texto(formData, "bairro");
    const cidadeId = texto(formData, "cidade_id");
    const estadoId = texto(formData, "estado_id");
    const matricula = texto(formData, "matricula");
    const inscricaoMunicipal = texto(formData, "inscricao_municipal");
    const imovelIdExistente = texto(formData, "imovel_id");
    const valorVenda = (() => {
      const t = texto(formData, "valor_venda");
      return t ? valorEditavelParaDecimal(t) : null;
    })();

    const prazoGestaoDias = (() => {
      const t = texto(formData, "prazo_gestao_dias");
      const n = t ? Number(t) : NaN;
      return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    })();
    const porcHonorario = (() => {
      const t = texto(formData, "porc_honorario");
      return t ? percentualParaDecimal(t) : null;
    })();
    const dataFechamento = data(formData, "data_fechamento") ?? new Date();

    if (!tipoImovel || !rua) {
      return { ok: false, erro: "Preencha ao menos o tipo do imóvel e a rua." };
    }
    if (!prazoGestaoDias) {
      return { ok: false, erro: "Informe o prazo da gestão em dias." };
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

    // Cria só os clientes que realmente são novos (sem clienteId); os
    // demais são só reaproveitados do banco, sem alterar nada neles.
    const clientesCriados = await Promise.all(
      clientesForm
        .filter((c) => !c.clienteId)
        .map((c) => {
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
              email: c.email || null,
              telefone: digitos(c.telefone),
              parceiro_id: session.parceiroId
            }
          });
        })
    ).catch((erro) => registrarEJogarErro({ entidadeTipo: "clientes", acao: "criar_via_portal", erro }));

    // Remonta a lista de clientes na mesma ordem em que apareceram no
    // formulário (mistura existentes reaproveitados + recém-criados) — o
    // primeiro da lista continua sendo o Contratante principal da gestão.
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

    let cidade = null as Awaited<ReturnType<typeof prisma.cidades.findUnique>>;
    let estado = null as Awaited<ReturnType<typeof prisma.estados.findUnique>>;
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

      [cidade, estado] = await Promise.all([
        imovel.cidade_id ? prisma.cidades.findUnique({ where: { id: imovel.cidade_id } }) : Promise.resolve(null),
        imovel.estado_id ? prisma.estados.findUnique({ where: { id: imovel.estado_id } }) : Promise.resolve(null)
      ]);
    } else {
      [cidade, estado] = await Promise.all([
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
            rua,
            n_predial: nPredial,
            complemento,
            bairro,
            cidade_id: cidadeId,
            estado_id: estadoId,
            endereco: enderecoCompletoNovo || null,
            matricula,
            inscricao: inscricaoMunicipal,
            valor_venda: valorVenda,
            parceiro_id: session.parceiroId,
            imoveis_proprietarios: {
              create: clientesResultado.map((c, ordem) => ({ cliente_id: c.id, ordem }))
            }
          }
        })
        .catch((erro) => registrarEJogarErro({ entidadeTipo: "imoveis", acao: "criar_via_portal", erro }));
    }

    const enderecoCompleto = [
      [imovel.rua, imovel.n_predial].filter(Boolean).join(", ") || null,
      imovel.complemento,
      imovel.bairro,
      cidade?.nome ?? null,
      estado?.nome ?? null
    ]
      .filter((p): p is string => Boolean(p))
      .join(" - ");

    const gestao = await prisma.gestoes
      .create({
        data: {
          cliente_id: principal.id,
          imovel_id: imovel.id,
          parceiro_id: session.parceiroId,
          valor_venda: valorVenda,
          porc_honorario: porcHonorario,
          prazo_gestao_dias: prazoGestaoDias,
          data_assinatura: dataFechamento,
          coluna: "captacao_exclusiva",
          criado_no_portal: true
        }
      })
      .catch((erro) => registrarEJogarErro({ entidadeTipo: "gestoes", acao: "criar_via_portal", erro }));

    // Primeira atividade já nasce agendada: vencimento do contrato, direto
    // no quadro/calendário/painel de Gestões — é assim que o vencimento cai
    // sozinho no radar sem o corretor precisar lançar nada a mais.
    const vencimento = new Date(dataFechamento.getTime() + prazoGestaoDias * 24 * 60 * 60 * 1000);
    await prisma.gestao_atividades.create({
      data: {
        gestao_id: gestao.id,
        tipo: "vencimento_contrato",
        titulo: "Vencimento do contrato de gestão",
        data: vencimento,
        feito: false
      }
    });

    const url = await gerarDocumento({
      tipoDocumento: "contrato_gestao",
      entidadeTipo: "gestao",
      entidadeId: gestao.id
    });

    await logAlteracaoPortal({
      parceiroId: session.parceiroId,
      entidadeTipo: "gestoes",
      entidadeId: gestao.id,
      acao: "gerar_contrato_gestao",
      dadosDepois: { imovel: enderecoCompleto, cliente: principal.nome, url }
    });

    return { ok: true, url };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return { ok: false, erro: mensagem };
  }
}
