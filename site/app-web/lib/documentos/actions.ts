"use server";

import { prisma } from "@/lib/prisma";
import { requireAdminSession, logAlteracao } from "@/lib/auth";
import { gerarDocumento, ENTIDADE_POR_DOCUMENTO } from "./gerar";
import type { TipoDocumento } from "./campos";

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
      const rows = await prisma.transacoes.findMany({
        where: termo
          ? {
              OR: [
                { chave: { contains: termo, mode: "insensitive" } },
                { imoveis: { endereco: { contains: termo, mode: "insensitive" } } },
                { clientes_transacoes_cliente_idToclientes: { nome: { contains: termo, mode: "insensitive" } } }
              ]
            }
          : undefined,
        include: { imoveis: true, clientes_transacoes_cliente_idToclientes: true },
        orderBy: { created_at: "desc" },
        take: 20
      });
      return rows.map((t) => ({
        id: t.id,
        label: `${t.chave ?? "sem chave"} · ${t.tipo} · ${t.imoveis?.endereco ?? "—"} · ${
          t.clientes_transacoes_cliente_idToclientes.nome
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
      const rows = await prisma.adm_imoveis.findMany({
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
      return rows.map((a) => ({ id: a.id, label: `${a.imoveis.endereco ?? "—"} · ${a.clientes.nome}` }));
    }
    case "cont_corretor": {
      const rows = await prisma.contratos_corretor.findMany({
        where: termo ? { parceiros: { nome: { contains: termo, mode: "insensitive" } } } : undefined,
        include: { parceiros: true },
        orderBy: { created_at: "desc" },
        take: 20
      });
      return rows.map((c) => ({ id: c.id, label: `${c.parceiros.nome} · ${c.status}` }));
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
