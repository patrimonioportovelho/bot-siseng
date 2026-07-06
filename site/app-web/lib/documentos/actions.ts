"use server";

import { prisma } from "@/lib/prisma";
import { requireAdminSession, logAlteracao } from "@/lib/auth";
import { gerarDocumento, ENTIDADE_POR_DOCUMENTO } from "./gerar";
import type { TipoDocumento } from "./campos";
import { formatInscricao } from "@/lib/format";

export type OpcaoRegistro = { id: string; label: string };

// Busca os registros disponíveis para o tipo de documento escolhido, para a
// tela de geração em Configurações — a "chave" que o usuário digita é a
// chave da transação, o endereço do imóvel ou o nome do parceiro, dependendo
// do modelo (ver ENTIDADE_POR_DOCUMENTO).
export async function buscarRegistrosAction(
  tipoDocumento: TipoDocumento,
  termoBruto: string
): Promise<OpcaoRegistro[]> {
  await requireAdminSession();
  const termo = termoBruto.trim();
  const entidadeTipo = ENTIDADE_POR_DOCUMENTO[tipoDocumento];

  switch (entidadeTipo) {
    case "transacao": {
      // Contrato de locação/compra e venda só faz sentido pra transação que
      // ainda está em elaboração — depois de "Transação Finalizada" o
      // contrato já foi gerado, não tem por que aparecer de novo aqui.
      const filtroStatus =
        tipoDocumento === "contrato_compra_venda"
          ? { status: "Elaboração do Contrato de Compra e Venda" }
          : tipoDocumento === "contrato_locacao"
          ? { status: "Elaboração de Contrato de Locação" }
          : {};
      const rows = await prisma.transacoes.findMany({
        where: {
          ...filtroStatus,
          ...(termo
            ? {
                OR: [
                  { id_legado: { contains: termo, mode: "insensitive" } },
                  { imoveis: { endereco: { contains: termo, mode: "insensitive" } } },
                  { clientes_transacoes_cliente_idToclientes: { nome: { contains: termo, mode: "insensitive" } } },
                  {
                    clientes_transacoes_cliente_contraparte_idToclientes: {
                      nome: { contains: termo, mode: "insensitive" }
                    }
                  }
                ]
              }
            : {})
        },
        include: {
          imoveis: true,
          clientes_transacoes_cliente_idToclientes: true,
          clientes_transacoes_cliente_contraparte_idToclientes: true
        },
        orderBy: { created_at: "desc" },
        take: 20
      });
      // Label: Id — Cliente Proprietário x Cliente Interessado (só o
      // principal, primeiro da lista — mesma convenção usada no resto do
      // sistema) — muito mais fácil de reconhecer do que o antigo campo
      // "chave" (que na verdade guarda o momento de entrega das chaves).
      return rows.map((t) => ({
        id: t.id,
        label: `${t.id_legado ?? t.id} — ${t.clientes_transacoes_cliente_idToclientes.nome} x ${
          t.clientes_transacoes_cliente_contraparte_idToclientes?.nome ?? "sem interessado"
        }`
      }));
    }
    case "gestao": {
      const rows = await prisma.gestoes.findMany({
        where: termo
          ? {
              OR: [
                { imoveis: { endereco: { contains: termo, mode: "insensitive" } } },
                { clientes: { nome: { contains: termo, mode: "insensitive" } } }
              ]
            }
          : undefined,
        include: { imoveis: true, clientes: true },
        orderBy: { created_at: "desc" },
        take: 20
      });
      return rows.map((g) => ({ id: g.id, label: `${g.imoveis.endereco ?? "—"} · ${g.clientes.nome}` }));
    }
    case "adm_imovel": {
      // Só entra aqui quem está em Captação: gerar o contrato de
      // administração é justamente o passo que "ativa" a administração (ver
      // gerarDocumento, que faz a transição automática para Ativo).
      const rows = await prisma.adm_imoveis.findMany({
        where: {
          status: "Captação",
          ...(termo
            ? {
                OR: [
                  { id_legado: { contains: termo, mode: "insensitive" as const } },
                  { imoveis: { endereco: { contains: termo, mode: "insensitive" as const } } },
                  { imoveis: { inscricao: { contains: termo, mode: "insensitive" as const } } },
                  { clientes: { nome: { contains: termo, mode: "insensitive" as const } } }
                ]
              }
            : {})
        },
        include: { imoveis: true, clientes: true },
        orderBy: { created_at: "desc" },
        take: 20
      });
      // Id é a chave (usada para localizar a administração certa), mas o
      // label sempre mostra a inscrição do imóvel ao lado, pra dar pra
      // reconhecer de qual imóvel se trata.
      return rows.map((a) => ({
        id: a.id,
        label: `${a.id_legado ?? a.id} — ${formatInscricao(a.imoveis.inscricao) || "sem inscrição"} — ${a.clientes.nome}`
      }));
    }
    case "cont_corretor": {
      // Busca direto em parceiros (não em contratos_corretor): o contrato de
      // associação do corretor usa os dados de comissionamento já
      // cadastrados na própria ficha do parceiro (fee/%compra/%venda/dia do
      // fee), então qualquer parceiro com função Corretor aparece aqui,
      // tenha ou não um contrato antigo registrado em contratos_corretor.
      const rows = await prisma.parceiros.findMany({
        where: {
          funcao: "Corretor",
          ...(termo ? { nome: { contains: termo, mode: "insensitive" as const } } : {})
        },
        orderBy: { nome: "asc" },
        take: 20
      });
      return rows.map((p) => ({ id: p.id, label: p.nome }));
    }
    case "cont_corretor_estagiario": {
      // Mesma lógica do caso acima, mas só para função Corretor Estagiário —
      // modelo de contrato separado (contrato_associacao_corretor_estagiario.docx).
      const rows = await prisma.parceiros.findMany({
        where: {
          funcao: "Corretor Estagiário",
          ...(termo ? { nome: { contains: termo, mode: "insensitive" as const } } : {})
        },
        orderBy: { nome: "asc" },
        take: 20
      });
      return rows.map((p) => ({ id: p.id, label: p.nome }));
    }
    case "chaves": {
      const rows = await prisma.chaves.findMany({
        where: termo
          ? {
              transacoes: {
                OR: [
                  { chave: { contains: termo, mode: "insensitive" } },
                  { imoveis: { endereco: { contains: termo, mode: "insensitive" } } }
                ]
              }
            }
          : undefined,
        include: { transacoes: { include: { imoveis: true } } },
        orderBy: { created_at: "desc" },
        take: 20
      });
      return rows.map((k) => ({
        id: k.id,
        label: `${k.transacoes.chave ?? "sem chave"} · ${k.transacoes.imoveis?.endereco ?? "—"}`
      }));
    }
    case "movimentacao": {
      const rows = await prisma.movimentacoes.findMany({
        where: termo
          ? {
              OR: [
                { contraparte_nome: { contains: termo, mode: "insensitive" } },
                { parceiros: { nome: { contains: termo, mode: "insensitive" } } },
                { transacoes: { chave: { contains: termo, mode: "insensitive" } } }
              ]
            }
          : undefined,
        include: { parceiros: true, transacoes: true },
        orderBy: { created_at: "desc" },
        take: 20
      });
      return rows.map((m) => ({
        id: m.id,
        label: `${m.tipo} · R$ ${Number(m.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ${
          m.parceiros?.nome ?? m.contraparte_nome ?? "—"
        }${m.transacoes?.chave ? " · " + m.transacoes.chave : ""}`
      }));
    }
    case "parceiro": {
      const rows = await prisma.parceiros.findMany({
        where: termo ? { nome: { contains: termo, mode: "insensitive" } } : undefined,
        orderBy: { nome: "asc" },
        take: 20
      });
      return rows.map((p) => ({ id: p.id, label: p.nome }));
    }
  }
}

export async function gerarDocumentoAction(
  tipoDocumento: TipoDocumento,
  entidadeId: string
): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
  await requireAdminSession();
  const entidadeTipo = ENTIDADE_POR_DOCUMENTO[tipoDocumento];

  try {
    const url = await gerarDocumento({ tipoDocumento, entidadeTipo, entidadeId });
    await logAlteracao({
      entidadeTipo: "documentos_gerados",
      entidadeId,
      acao: `gerar_${tipoDocumento}`,
      dadosDepois: { url }
    });
    return { ok: true, url };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return { ok: false, erro: mensagem };
  }
}
