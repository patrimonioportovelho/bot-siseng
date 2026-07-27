import Link from "next/link";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalHeader } from "@/components/portal-header";
import { PortalRascunhoAviso } from "@/components/portal-rascunho-aviso";
import { prisma } from "@/lib/prisma";
import { formatMoeda, formatDataCalendario } from "@/lib/format";

export const dynamic = "force-dynamic";

type Tone = "ativa" | "alerta" | "encerrada";

const TONE_CLASSES: Record<Tone, string> = {
  ativa: "bg-blue-50 text-blue-700 border-blue-200",
  alerta: "bg-amber-50 text-amber-700 border-amber-200",
  encerrada: "bg-red-50 text-red-600 border-red-200"
};

// "Encerrado" é o único status terminal deste módulo (ver
// lib/administracoes/opcoes.ts: Captação, Ativo, Locado, Encerrado) — some
// desta lista assim que chega lá, contando só no painel principal (/portal).
function statusTone(status: string): Tone {
  if (status === "Encerrado") return "encerrada";
  if (status === "Locado") return "alerta";
  return "ativa";
}

// Painel do corretor pra Administração — mesmo padrão dos demais módulos:
// só leitura (quem edita é o administrativo), rascunho salvo no navegador em
// destaque, encerradas saem da lista.
export default async function PortalAdministracaoPage() {
  const session = await requirePortalSession();

  const administracoes = await prisma.adm_imoveis.findMany({
    where: { parceiro_id: session.parceiroId, excluido: false, status: { not: "Encerrado" } },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      id_legado: true,
      status: true,
      valor_transacao: true,
      created_at: true,
      clientes: { select: { nome: true } },
      imoveis: { select: { endereco: true } }
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
          <div className="text-lg font-bold text-gray-900">Administração</div>
          <Link
            href="/portal/administracao/novo"
            className="text-xs bg-primary text-white rounded-lg px-4 py-2 font-semibold hover:opacity-90"
          >
            + Nova administração
          </Link>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Suas administrações em andamento — depois de cadastrado só dá pra acompanhar aqui, quem altera é o
          administrativo. Encerradas saem desta lista (contam só no seu painel principal).
        </p>

        <div className="mb-4">
          <PortalRascunhoAviso chave="sis_rascunho_administracao" href="/portal/administracao/novo" label="administração" />
        </div>

        {administracoes.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
            <p className="text-xs text-gray-400">Nenhuma administração em andamento no momento.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {administracoes.map((a) => (
              <div key={a.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                  <span className="text-sm font-semibold text-gray-800">
                    {a.imoveis?.endereco ?? "Imóvel sem endereço"}
                  </span>
                  <span
                    className={`text-[11px] font-semibold px-2 py-1 rounded-lg border whitespace-nowrap ${TONE_CLASSES[statusTone(a.status)]}`}
                  >
                    {a.status}
                  </span>
                </div>
                <div className="text-[11px] text-gray-400">
                  {a.id_legado ?? a.id} · {formatMoeda(a.valor_transacao)}/mês · cadastrada em{" "}
                  {formatDataCalendario(a.created_at)}
                  {a.clientes?.nome && <> · Propr.: {a.clientes.nome}</>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
