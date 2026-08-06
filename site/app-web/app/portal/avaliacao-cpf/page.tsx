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

// Faixas de prazo da consulta — pedido do usuário em 06/08/2026: enquanto
// não existe uma "aprovação" com data_validade real preenchida pelo banco/
// administrativo, a avaliação usa a data do CADASTRO como relógio (dias
// desde que o corretor cadastrou/solicitou), reaproveitando as mesmas
// faixas de 30/60/180 dias — não existe mais uma faixa separada "sem
// validade". Isso resolve o problema relatado: uma avaliação recém-
// cadastrada tem 0 dias "desde o cadastro", cai direto na faixa "até 30
// dias" (perto do topo) em vez de ficar escondida no fim da lista.
// Só quando data_validade é preenchida (aprovação de crédito de verdade) o
// relógio muda pra "dias até vencer" — inclusive podendo virar "vencida".
// "Vencida" fica por último (pedido do usuário: "pode colocar pra baixo").
type FaixaPrazo = "ate30" | "ate60" | "ate180" | "mais180" | "vencida";

const ORDEM_FAIXAS: FaixaPrazo[] = ["ate30", "ate60", "ate180", "mais180", "vencida"];

const FAIXA_INFO: Record<FaixaPrazo, { titulo: string; tone: string }> = {
  ate30: { titulo: "Até 30 dias", tone: "bg-orange-50 text-orange-700 border-orange-200" },
  ate60: { titulo: "Até 60 dias", tone: "bg-amber-50 text-amber-700 border-amber-200" },
  ate180: { titulo: "Até 180 dias", tone: "bg-blue-50 text-blue-700 border-blue-200" },
  mais180: { titulo: "Mais de 180 dias", tone: "bg-green-50 text-green-700 border-green-200" },
  vencida: { titulo: "Consulta vencida", tone: "bg-red-50 text-red-700 border-red-200" }
};

const UM_DIA_MS = 24 * 60 * 60 * 1000;

function diferencaEmDias(data: Date): number {
  const hoje = new Date();
  const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dataSemHora = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  return Math.round((dataSemHora.getTime() - hojeSemHora.getTime()) / UM_DIA_MS);
}

// Chave única de classificação/ordenação: dias até vencer (quando tem
// data_validade real) ou dias desde o cadastro (fallback, sempre >= 0 —
// por isso nunca cai em "vencida"). Quanto menor, mais em evidência.
function diasChave(a: { data_validade: Date | null; created_at: Date }): number {
  if (a.data_validade) return diferencaEmDias(a.data_validade);
  return -diferencaEmDias(a.created_at);
}

function faixaDoPrazo(dias: number): FaixaPrazo {
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
    orderBy: { created_at: "desc" },
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

  // Ordenação final feita aqui (não dá pra pedir isso direto pro Prisma):
  // cada avaliação usa uma "chave de dias" diferente dependendo se já tem
  // data_validade real ou não (ver diasChave acima) — dentro de cada
  // faixa, a mais urgente/recente fica sempre no topo.
  const porFaixa = new Map<FaixaPrazo, typeof avaliacoes>();
  for (const a of avaliacoes) {
    const faixa = faixaDoPrazo(diasChave(a));
    const lista = porFaixa.get(faixa) ?? [];
    lista.push(a);
    porFaixa.set(faixa, lista);
  }
  for (const lista of porFaixa.values()) {
    lista.sort((a, b) => diasChave(a) - diasChave(b));
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
                          {a.data_validade ? (
                            <div className="text-[11px] text-gray-400">
                              Validade da consulta: {formatDataCalendario(a.data_validade)}
                              {(() => {
                                const dias = diferencaEmDias(a.data_validade);
                                return dias < 0 ? " (vencida)" : ` (${dias} dia${dias === 1 ? "" : "s"} restantes)`;
                              })()}
                            </div>
                          ) : (
                            <div className="text-[11px] text-gray-400">
                              Ainda sem validade registrada — aguardando aprovação do administrativo.
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
