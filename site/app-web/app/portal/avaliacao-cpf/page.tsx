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

// Painel do corretor pra Avaliação de CPF — pedido do usuário: "vai ter as
// avaliações, conforme a correspondente evolui no adm vai mudando aqui pro
// corretor". Cada avaliação é só leitura aqui (quem edita é o administrativo
// em /financiamento); o corretor só acompanha o status. Concluídas saem
// desta lista de propósito — já contam no painel principal (/portal), não
// precisam ficar aparecendo aqui pra sempre.
export default async function PortalAvaliacaoCpfPage() {
  const session = await requirePortalSession();

  const avaliacoes = await prisma.avaliacoes.findMany({
    where: { parceiro_id: session.parceiroId, excluido: false, status: { not: "Concluído" } },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      status: true,
      tipo_avaliacao: true,
      created_at: true,
      clientes: { select: { nome: true } },
      andamentos: { select: { status_andamento: true }, orderBy: { created_at: "desc" }, take: 1 }
    }
  });

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
          Suas avaliações em andamento — o status muda aqui conforme o administrativo avança o processo. Avaliações
          concluídas saem desta lista (contam só no seu painel principal).
        </p>

        <div className="mb-4">
          <PortalRascunhoAviso
            chave="sis_rascunho_avaliacao_cpf"
            href="/portal/avaliacao-cpf/novo"
            label="avaliação de CPF"
          />
        </div>

        {avaliacoes.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
            <p className="text-xs text-gray-400">Nenhuma avaliação em andamento no momento.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {avaliacoes.map((a) => {
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
