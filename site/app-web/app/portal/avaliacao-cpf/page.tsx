import Link from "next/link";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { PortalRascunhoAviso } from "@/components/portal-rascunho-aviso";
import { prisma } from "@/lib/prisma";
import { formatDataCalendario } from "@/lib/format";
import { STATUS_AVALIACAO_ENCERRADOS } from "@/lib/financiamento/opcoes";

export const dynamic = "force-dynamic";

type Tone = "ativa" | "alerta" | "encerrada";

const TONE_CLASSES: Record<Tone, string> = {
  ativa: "bg-blue-50 text-blue-700 border-blue-200",
  alerta: "bg-amber-50 text-amber-700 border-amber-200",
  encerrada: "bg-red-50 text-red-600 border-red-200"
};

function statusTone(status: string): Tone {
  if (STATUS_AVALIACAO_ENCERRADOS.includes(status)) return "encerrada";
  if (status === "Aprovado") return "alerta";
  return "ativa";
}

// Faixas de prazo da consulta (data_validade) — pedido do usuário: separar
// visualmente pra facilitar o corretor acompanhar quais consultas estão
// perto de vencer. "Vencida" e "sem data de validade" são faixas extras
// (não pedidas explicitamente, mas necessárias pra não sumir com nenhuma
// avaliação da lista — nem toda avaliação tem data_validade preenchida).
type FaixaPrazo = "vencida" | "ate30" | "ate60" | "ate180" | "mais180" | "semValidade";

const ORDEM_FAIXAS: FaixaPrazo[] = ["vencida", "ate30", "ate60", "ate180", "mais180", "semValidade"];

const FAIXA_INFO: Record<FaixaPrazo, { titulo: string; tone: string }> = {
  vencida: { titulo: "Consulta vencida", tone: "bg-red-50 text-red-700 border-red-200" },
  ate30: { titulo: "Vence em até 30 dias", tone: "bg-orange-50 text-orange-700 border-orange-200" },
  ate60: { titulo: "Vence em até 60 dias", tone: "bg-amber-50 text-amber-700 border-amber-200" },
  ate180: { titulo: "Vence em até 180 dias", tone: "bg-blue-50 text-blue-700 border-blue-200" },
  mais180: { titulo: "Vence em mais de 180 dias", tone: "bg-green-50 text-green-700 border-green-200" },
  semValidade: { titulo: "Sem data de validade informada", tone: "bg-gray-50 text-gray-500 border-gray-200" }
};

const UM_DIA_MS = 24 * 60 * 60 * 1000;

function diasRestantes(dataValidade: Date | null): number | null {
  if (!dataValidade) return null;
  const hoje = new Date();
  const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const validadeSemHora = new Date(dataValidade.getFullYear(), dataValidade.getMonth(), dataValidade.getDate());
  return Math.round((validadeSemHora.getTime() - hojeSemHora.getTime()) / UM_DIA_MS);
}

function faixaDoPrazo(dias: number | null): FaixaPrazo {
  if (dias === null) return "semValidade";
  if (dias < 0) return "vencida";
  if (dias <= 30) return "ate30";
  if (dias <= 60) return "ate60";
  if (dias <= 180) return "ate180";
  return "mais180";
}

// Painel do corretor pra Avaliação de CPF — pedido do usuário: "vai ter as
// avaliações, conforme a correspondente evolui no adm vai mudando aqui pro
// corretor". Cada avaliação é só leitura aqui (quem edita é o administrativo
// em /financiamento); o corretor só acompanha o status. Concluídas saem
// desta lista de propósito — já contam no painel principal (/portal), não
// precisam ficar aparecendo aqui pra sempre.
export default async function PortalAvaliacaoCpfPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requirePortalSession();
  const { q } = await searchParams;
  const termo = (q ?? "").trim();

  const avaliacoes = await prisma.avaliacoes.findMany({
    where: {
      parceiro_id: session.parceiroId,
      excluido: false,
      status: { not: "Concluído" },
      ...(termo
        ? {
            OR: [
              { cpf: { contains: termo, mode: "insensitive" as const } },
              { clientes: { nome: { contains: termo, mode: "insensitive" as const } } },
              { clientes: { cpf: { contains: termo, mode: "insensitive" as const } } },
              { clientes: { cnpj: { contains: termo, mode: "insensitive" as const } } }
            ]
          }
        : {})
    },
    orderBy: { data_validade: "asc" },
    select: {
      id: true,
      status: true,
      tipo_avaliacao: true,
      created_at: true,
      data_validade: true,
      clientes: { select: { nome: true, cpf: true, cnpj: true } },
      andamentos: { select: { status_andamento: true }, orderBy: { created_at: "desc" }, take: 1 }
    }
  });

  const porFaixa = new Map<FaixaPrazo, typeof avaliacoes>();
  for (const a of avaliacoes) {
    const faixa = faixaDoPrazo(diasRestantes(a.data_validade));
    const lista = porFaixa.get(faixa) ?? [];
    lista.push(a);
    porFaixa.set(faixa, lista);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader nome={session.nome} />

      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link href="/portal" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
          ← Voltar
        </Link>

        <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
          <div className="text-lg font-bold text-gray-900">Avaliação de CPF</div>
          <Link
            href="/portal/avaliacao-cpf/novo"
            className="text-xs bg-primary text-white rounded-lg px-4 py-2 font-semibold hover:opacity-90"
          >
            + Nova avaliação
          </Link>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Suas avaliações em andamento, separadas pelo prazo de validade da consulta — o status muda aqui conforme o
          administrativo avança o processo. Avaliações concluídas saem desta lista (contam só no seu painel
          principal).
        </p>

        <form className="flex gap-2 mb-4">
          <input
            type="text"
            name="q"
            defaultValue={termo}
            placeholder="Buscar por nome, CPF, CNPJ ou razão social..."
            className="text-xs border border-gray-300 rounded-lg px-3 py-2 w-full outline-none focus:border-primary bg-white"
          />
          <button
            type="submit"
            className="text-xs bg-white border border-gray-300 text-gray-600 rounded-lg px-4 py-2 font-semibold whitespace-nowrap hover:bg-gray-50"
          >
            Buscar
          </button>
          {termo && (
            <Link
              href="/portal/avaliacao-cpf"
              className="text-xs bg-white border border-gray-300 text-gray-400 rounded-lg px-3 py-2 whitespace-nowrap hover:text-gray-700"
            >
              limpar
            </Link>
          )}
        </form>

        <div className="mb-4">
          <PortalRascunhoAviso
            chave="sis_rascunho_avaliacao_cpf"
            href="/portal/avaliacao-cpf/novo"
            label="avaliação de CPF"
          />
        </div>

        {avaliacoes.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
            <p className="text-xs text-gray-400">
              {termo ? "Nenhuma avaliação encontrada pra essa busca." : "Nenhuma avaliação em andamento no momento."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {ORDEM_FAIXAS.map((faixa) => {
              const lista = porFaixa.get(faixa);
              if (!lista || lista.length === 0) return null;
              const info = FAIXA_INFO[faixa];
              return (
                <div key={faixa}>
                  <div
                    className={`inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 mb-2 rounded-lg border ${info.tone}`}
                  >
                    {info.titulo}
                    <span className="font-normal opacity-70">({lista.length})</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {lista.map((a) => {
                      const andamento = a.andamentos[0];
                      const dias = diasRestantes(a.data_validade);
                      return (
                        <div key={a.id} className="bg-white border border-gray-200 rounded-xl p-4">
                          <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                            <span className="text-sm font-semibold text-gray-800">
                              {a.clientes?.nome ?? "Cliente não identificado"}
                            </span>
                            <span
                              className={`text-[11px] font-semibold px-2 py-1 rounded-lg border whitespace-nowrap ${TONE_CLASSES[statusTone(a.status)]}`}
                            >
                              {a.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-gray-400">
                            {a.tipo_avaliacao ?? "Avaliação"} · cadastrada em {formatDataCalendario(a.created_at)}
                            {andamento && <> · andamento: {andamento.status_andamento}</>}
                          </div>
                          <div className="text-[11px] text-gray-400">
                            {a.clientes?.cpf ? `CPF: ${a.clientes.cpf}` : a.clientes?.cnpj ? `CNPJ: ${a.clientes.cnpj}` : ""}
                          </div>
                          {a.data_validade && (
                            <div className="text-[11px] text-gray-400">
                              Validade da consulta: {formatDataCalendario(a.data_validade)}
                              {dias !== null && (dias < 0 ? " (vencida)" : ` (${dias} dia${dias === 1 ? "" : "s"} restantes)`)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
