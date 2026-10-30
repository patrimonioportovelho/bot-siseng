import { prisma } from "@/lib/prisma";

// Avisos da equipe (estilo MSN): o que um corretor faz no portal e a equipe
// administrativa vê numa janelinha no canto da tela. Ver
// components/avisos-equipe-toasts.tsx e app/api/avisos/route.ts.

export const TIPOS_AVISO: Record<string, { icone: string; titulo: (nome: string) => string }> = {
  login: { icone: "👋", titulo: (n) => `${n} entrou no portal` },
  proposta: { icone: "📝", titulo: (n) => `${n} fez uma proposta` },
  avaliacao_cpf: { icone: "🔎", titulo: (n) => `${n} cadastrou uma consulta de CPF` },
  avaliacao_credito: { icone: "🏦", titulo: (n) => `${n} cadastrou uma avaliação de crédito` },
  avaliacao_convertida: { icone: "🏦", titulo: (n) => `${n} transformou uma consulta em avaliação de crédito` },
  compra_venda: { icone: "🏠", titulo: (n) => `${n} cadastrou uma Compra e Venda` },
  locacao: { icone: "🔑", titulo: (n) => `${n} cadastrou uma Locação` },
  administracao: { icone: "📋", titulo: (n) => `${n} cadastrou uma Administração` },
  gestao: { icone: "📑", titulo: (n) => `${n} gerou um contrato de Gestão` }
};

const MINUTOS_SEM_REPETIR_LOGIN = 30;

// Grava um aviso. Nunca lança erro: aviso é complemento e não pode derrubar o
// login nem o cadastro do corretor.
export async function registrarAviso(params: { tipo: string; parceiroId: string; detalhe?: string | null; url?: string | null }) {
  try {
    if (!TIPOS_AVISO[params.tipo]) return;
    // Quem entra várias vezes seguidas só avisa uma vez (a cada 30 min).
    if (params.tipo === "login") {
      const recente = await prisma.avisos_equipe.findFirst({
        where: { tipo: "login", parceiro_id: params.parceiroId, created_at: { gt: new Date(Date.now() - MINUTOS_SEM_REPETIR_LOGIN * 60000) } },
        select: { id: true }
      });
      if (recente) return;
    }
    await prisma.avisos_equipe.create({
      data: { tipo: params.tipo, parceiro_id: params.parceiroId, detalhe: params.detalhe ?? null, url: params.url ?? null }
    });
    // limpeza: de vez em quando apaga o que tem mais de 7 dias
    if (Math.random() < 0.05) {
      await prisma.avisos_equipe.deleteMany({ where: { created_at: { lt: new Date(Date.now() - 7 * 86400000) } } });
    }
  } catch {
    // ignora
  }
}

type Dados = Record<string, unknown> | null | undefined;
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

// Traduz um log de ação do portal em aviso (ou null quando não é cadastro novo).
export function avisoDeAcaoPortal(acao: string, entidadeId: string | null | undefined, dados: Dados): { tipo: string; detalhe: string | null; url: string | null } | null {
  const d = dados ?? {};
  switch (acao) {
    case "gerar_proposta_compra_venda": {
      const valor = Number(d.valor);
      const partes = [texto(d.cliente), Number.isFinite(valor) && valor > 0 ? valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : null].filter(Boolean);
      return { tipo: "proposta", detalhe: partes.join(" — ") || null, url: null };
    }
    case "criar_avaliacao_cpf":
    case "criar_avaliacao_credito":
    case "converter_avaliacao_credito":
      return {
        tipo: acao === "criar_avaliacao_cpf" ? "avaliacao_cpf" : acao === "criar_avaliacao_credito" ? "avaliacao_credito" : "avaliacao_convertida",
        detalhe: texto(d.cliente),
        url: entidadeId ? `/financiamento/${entidadeId}/etiqueta` : null
      };
    case "gerar_compra_venda":
      return { tipo: "compra_venda", detalhe: texto(d.id_legado), url: entidadeId ? `/transacoes/${entidadeId}` : null };
    case "gerar_locacao":
      return { tipo: "locacao", detalhe: texto(d.id_legado), url: entidadeId ? `/transacoes/${entidadeId}` : null };
    case "cadastrar_administracao":
      return { tipo: "administracao", detalhe: [texto(d.id_legado), texto(d.cliente)].filter(Boolean).join(" — ") || null, url: entidadeId ? `/administracoes/${entidadeId}` : null };
    case "gerar_contrato_gestao":
      return { tipo: "gestao", detalhe: [texto(d.cliente), texto(d.imovel)].filter(Boolean).join(" — ") || null, url: entidadeId ? `/gestoes/${entidadeId}` : null };
    default:
      return null;
  }
}
