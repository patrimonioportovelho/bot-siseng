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

// Um cliente digitado no formulário do portal (não é uma busca em cadastro
// existente — o corretor sempre cria um cliente novo aqui, mesmo que a
// pessoa já exista no sistema; caso vire duplicidade, o admin resolve depois
// pelo cadastro de Clientes).
type ClienteDigitado = {
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
        nome: String(c?.nome ?? "").trim(),
        rg: String(c?.rg ?? "").trim(),
        cpfCnpj: String(c?.cpfCnpj ?? "").trim(),
        endereco: String(c?.endereco ?? "").trim(),
        nacionalidade: String(c?.nacionalidade ?? "").trim(),
        estadoCivil: String(c?.estadoCivil ?? "").trim(),
        email: String(c?.email ?? "").trim(),
        telefone: String(c?.telefone ?? "").trim()
      }))
      .filter((c) => c.nome.length > 0);
  } catch {
    return [];
  }
}

// Gera o Contrato de Gestão a partir do formulário do portal: cria o(s)
// cliente(s) e o imóvel (já vinculado a todos eles como proprietários,
// mesmo padrão do cadastro de Imóveis no admin), cria o registro de Gestão
// (Captação Exclusiva, primeira coluna do quadro de Gestões em Atividades)
// com uma atividade já agendada de vencimento do contrato, gera o .docx
// (reaproveitando o mesmo pipeline de app/configuracoes) e registra tudo
// em logs_acesso/logs_alteracao para auditoria.
export async function gerarContratoGestaoAction(
  formData: FormData
): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
  const session = await requirePortalSession();

  try {
    const clientesDigitados = parseClientes(formData);
    if (clientesDigitados.length === 0) {
      return { ok: false, erro: "Cadastre ao menos um cliente." };
    }

    const tipoImovel = texto(formData, "tipo_imovel");
    const rua = texto(formData, "rua");
    const nPredial = texto(formData, "n_predial");
    const complemento = texto(formData, "complemento");
    const bairro = texto(formData, "bairro");
    const cidadeId = texto(formData, "cidade_id");
    const estadoId = texto(formData, "estado_id");
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

    const [cidade, estado] = await Promise.all([
      cidadeId ? prisma.cidades.findUnique({ where: { id: cidadeId } }) : Promise.resolve(null),
      estadoId ? prisma.estados.findUnique({ where: { id: estadoId } }) : Promise.resolve(null)
    ]);
    const enderecoCompleto = [
      [rua, nPredial].filter(Boolean).join(", ") || null,
      complemento,
      bairro,
      cidade?.nome ?? null,
      estado?.nome ?? null
    ]
      .filter((p): p is string => Boolean(p))
      .join(" - ");

    // Cria todos os clientes digitados no formulário (o primeiro vira o
    // Contratante principal da gestão; todos entram como proprietários do
    // imóvel, na mesma ordem em que foram adicionados no formulário).
    const clientesCriados = await Promise.all(
      clientesDigitados.map((c) => {
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

    const principal = clientesCriados[0];

    const imovel = await prisma.imoveis
      .create({
        data: {
          tipo_imovel: tipoImovel,
          rua,
          n_predial: nPredial,
          complemento,
          bairro,
          cidade_id: cidadeId,
          estado_id: estadoId,
          endereco: enderecoCompleto || null,
          valor_venda: valorVenda,
          parceiro_id: session.parceiroId,
          imoveis_proprietarios: {
            create: clientesCriados.map((c, ordem) => ({ cliente_id: c.id, ordem }))
          }
        }
      })
      .catch((erro) => registrarEJogarErro({ entidadeTipo: "imoveis", acao: "criar_via_portal", erro }));

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
