"use server";

import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { logAlteracaoPortal } from "@/lib/auth";
import { valorEditavelParaDecimal, percentualParaDecimal } from "@/lib/format";
import { registrarEJogarErro } from "@/lib/erros";
import { buscarClienteDuplicado, mensagemClienteDuplicado } from "@/lib/clientes/duplicidade";

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

// Cadastra a "Elaboração de Contrato de Administração" a partir do portal do
// corretor: mesmo padrão do Contrato de Gestão pra cliente(s)/imóvel
// (reaproveita cadastro existente quando escolhido, cria os que forem
// realmente novos, com a mesma checagem de duplicidade), mas usando o
// cadastro de Administração de verdade (adm_imoveis), com os mesmos campos
// do formulário "Nova administração" do administrativo.
//
// Diferente de Compra e Venda e Gestão, aqui o corretor NÃO gera o
// documento — quem decide status (Ativo/Locado/Encerrado) e gera o contrato
// pra assinatura é sempre o administrativo. Por isso a administração sempre
// nasce com status "Captação" (primeira coluna do quadro de Administrações),
// independente do que o formulário mandar.
export async function gerarContratoAdministracaoAction(
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
      acao: "gerar_contrato_administracao",
      dadosDepois: { id_legado: novaAdministracao.id_legado, cliente: principal.nome, imovel_id: imovel.id }
    });

    return { ok: true, idLegado: novaAdministracao.id_legado };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return { ok: false, erro: mensagem };
  }
}
