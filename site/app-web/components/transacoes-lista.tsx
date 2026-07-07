import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  formatMoeda,
  formatData,
  formatInscricao,
  calcularPrazoRestante,
  diasParaVencimento,
  situacaoContratoLocacao,
  statusTone,
  STATUS_TRANSACAO_TODOS,
  type Tone
} from "@/lib/format";

// Elaboração de Contrato de Locação precisa aparecer primeiro no dashboard
// de Locação (é o que precisa de atenção pra virar contrato) — o resto dos
// status segue a mesma ordem de sempre (STATUS_TRANSACAO_TODOS).
const PRIORIDADE_LOCACAO = "Elaboração de Contrato de Locação";

// Cor de destaque do cabeçalho de cada grupo de Status, pra separar
// visualmente as locações em andamento das finalizadas/canceladas.
const TONE_CLASSES: Record<Tone, string> = {
  ativa: "bg-blue-50 text-blue-700 border-blue-200",
  concluida: "bg-green-50 text-green-700 border-green-200",
  pendente: "bg-gray-50 text-gray-600 border-gray-200",
  cancelada: "bg-red-50 text-red-600 border-red-200"
};

// Listagem compartilhada por /transacoes/locacao e /transacoes/venda — cada
// uma chama isso com o Tipo já fixo (menu separado, sem aba de trocar tipo).
// Agrupa por Loja e, dentro da loja, por Status (mesmo padrão da tela de
// Administrações). Linha inteira é clicável e abre o detalhe.
export async function TransacoesLista({ tipo, q, novoHref }: { tipo: "Locação" | "Compra e Venda"; q?: string; novoHref: string }) {
  const termo = (q ?? "").trim();
  const somenteLocacao = tipo === "Locação";

  const where = {
    tipo,
    excluido: false,
    ...(termo
      ? {
          OR: [
            { imoveis: { endereco: { contains: termo, mode: "insensitive" as const } } },
            { imoveis: { inscricao: { contains: termo, mode: "insensitive" as const } } },
            {
              imoveis: {
                imoveis_proprietarios: { some: { clientes: { nome: { contains: termo, mode: "insensitive" as const } } } }
              }
            },
            {
              transacoes_contrapartes: { some: { clientes: { nome: { contains: termo, mode: "insensitive" as const } } } }
            },
            { id_legado: { contains: termo, mode: "insensitive" as const } }
          ]
        }
      : {})
  };

  const transacoes = await prisma.transacoes.findMany({
    where,
    orderBy: { created_at: "desc" },
    include: {
      lojas: true,
      imoveis: { include: { imoveis_proprietarios: { include: { clientes: true }, orderBy: { ordem: "asc" } } } },
      transacoes_contrapartes: { include: { clientes: true }, orderBy: { ordem: "asc" } }
    }
  });

  const porLoja = new Map<string, typeof transacoes>();
  for (const t of transacoes) {
    const nomeLoja = t.lojas?.nome ?? "Sem loja";
    if (!porLoja.has(nomeLoja)) porLoja.set(nomeLoja, []);
    porLoja.get(nomeLoja)!.push(t);
  }
  const lojasOrdenadas = [...porLoja.keys()].sort((x, y) => {
    const ordem = ["Porto Velho", "Jaru"];
    const ix = ordem.indexOf(x);
    const iy = ordem.indexOf(y);
    if (ix === -1 && iy === -1) return x.localeCompare(y);
    if (ix === -1) return 1;
    if (iy === -1) return -1;
    return ix - iy;
  });

  // Id é o identificador que sai no rodapé do contrato — primeira coluna,
  // sempre visível, mesmo padrão usado em Administrações. Locação tem mais
  // colunas pra acompanhamento diário: assinatura, vencimento do contrato,
  // dia de pagamento e prazo (com alerta de renovação/cancelamento).
  // Importante: cada linha (e o cabeçalho) é um grid independente, então
  // colunas com largura "auto" ficam do tamanho do conteúdo daquela linha
  // específica e desalinham tudo entre as linhas — por isso as colunas de
  // data/valor usam px fixo, garantindo a mesma largura em todas as linhas.
  const colunas = somenteLocacao
    ? "grid-cols-[0.6fr_1fr_1fr_1fr_84px_84px_56px_190px_100px]"
    : "grid-cols-[0.8fr_1.6fr_1.4fr_1.4fr_90px_110px]";

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-bold text-gray-800">
          {tipo} ({transacoes.length})
        </div>
        <div className="flex gap-2">
          <form className="flex gap-2">
            <input
              type="text"
              name="q"
              defaultValue={termo}
              placeholder="Buscar por imóvel, cliente ou Id..."
              className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-64 outline-none focus:border-primary"
            />
            <button type="submit" className="text-xs bg-white border border-gray-300 text-gray-600 rounded-lg px-3 py-1.5">
              Buscar
            </button>
          </form>
          <Link
            href={novoHref}
            className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap"
          >
            + Adicionar transação
          </Link>
        </div>
      </div>

      {transacoes.length === 0 && (
        <div className="py-6 text-center text-gray-400 text-xs">Nenhuma transação encontrada.</div>
      )}

      {lojasOrdenadas.map((nomeLoja) => {
        const doLoja = porLoja.get(nomeLoja)!;
        const porStatus = new Map<string, typeof transacoes>();
        for (const t of doLoja) {
          const s = t.status ?? "Sem status";
          if (!porStatus.has(s)) porStatus.set(s, []);
          porStatus.get(s)!.push(t);
        }
        const statusOrdenados = [...porStatus.keys()].sort((x, y) => {
          if (somenteLocacao) {
            if (x === PRIORIDADE_LOCACAO) return -1;
            if (y === PRIORIDADE_LOCACAO) return 1;
          }
          const ix = STATUS_TRANSACAO_TODOS.indexOf(x);
          const iy = STATUS_TRANSACAO_TODOS.indexOf(y);
          if (ix === -1 && iy === -1) return x.localeCompare(y);
          if (ix === -1) return 1;
          if (iy === -1) return -1;
          return ix - iy;
        });

        return (
          <div key={nomeLoja} className="mb-6 last:mb-0">
            <div className="text-xs font-bold text-gray-700 bg-gray-50 rounded-lg px-3 py-2 mb-2">
              {nomeLoja} ({doLoja.length})
            </div>

            {statusOrdenados.map((status) => {
              const doStatus = porStatus.get(status)!;
              const tone = statusTone(status === "Sem status" ? null : status);
              return (
                <div key={status} className="mb-3 last:mb-0">
                  <div
                    className={`text-xs font-bold px-3 py-1.5 mb-1 rounded-lg border ${TONE_CLASSES[tone]}`}
                  >
                    {status} ({doStatus.length})
                  </div>
                  <div className={`grid ${colunas} gap-3 px-3 py-1 text-[11px] text-gray-400 border-b border-gray-100`}>
                    <span>Id</span>
                    <span>{somenteLocacao ? "Imóvel" : "Inscrição"}</span>
                    <span>Cliente Proprietário</span>
                    <span>Cliente Interessado</span>
                    <span>Assinatura</span>
                    {somenteLocacao && <span>Vencimento</span>}
                    {somenteLocacao && <span>Dia pgto.</span>}
                    {somenteLocacao && <span>Prazo do contrato</span>}
                    <span className="text-right">Valor</span>
                  </div>
                  <div className="flex flex-col">
                    {doStatus.map((t) => {
                      const proprietarios = t.imoveis?.imoveis_proprietarios.map((v) => v.clientes) ?? [];
                      const interessados = t.transacoes_contrapartes.map((v) => v.clientes);

                      // Vencido/alerta só faz sentido pra locação em andamento
                      // (não destaca contrato já finalizado/cancelado).
                      const situacao =
                        somenteLocacao && tone === "ativa" ? situacaoContratoLocacao(t.data_vencimento) : null;

                      const corLinha =
                        situacao === "vencido"
                          ? "bg-red-50 border border-red-200 hover:bg-red-100"
                          : situacao === "alerta"
                          ? "bg-amber-50 border border-amber-200 hover:bg-amber-100"
                          : "hover:bg-gray-50";

                      return (
                        <Link
                          key={t.id}
                          href={`/transacoes/${t.id}`}
                          className={`grid ${colunas} gap-3 items-center px-3 py-2.5 rounded-lg transition-colors ${corLinha}`}
                        >
                          <span className={`text-xs truncate ${situacao === "vencido" ? "text-red-700" : "text-gray-500"}`}>
                            {t.id_legado ?? t.id}
                          </span>
                          <span className={`text-xs truncate ${situacao === "vencido" ? "text-red-700" : "text-gray-500"}`}>
                            {somenteLocacao ? t.imoveis?.endereco ?? "—" : formatInscricao(t.imoveis?.inscricao) || "—"}
                          </span>
                          <span
                            className={`text-xs font-medium truncate ${situacao === "vencido" ? "text-red-800" : "text-gray-800"}`}
                          >
                            {proprietarios[0]?.nome ?? "—"}
                            {proprietarios.length > 1 && (
                              <span className="text-gray-400 font-normal"> +{proprietarios.length - 1}</span>
                            )}
                          </span>
                          <span className={`text-xs truncate ${situacao === "vencido" ? "text-red-700" : "text-gray-700"}`}>
                            {interessados[0]?.nome ?? "—"}
                            {interessados.length > 1 && (
                              <span className="text-gray-400 font-normal"> +{interessados.length - 1}</span>
                            )}
                          </span>
                          <span className={`text-xs whitespace-nowrap ${situacao === "vencido" ? "text-red-700" : "text-gray-500"}`}>
                            {formatData(t.data_assinatura)}
                          </span>
                          {somenteLocacao && (
                            <span
                              className={`text-xs whitespace-nowrap ${situacao === "vencido" ? "text-red-700" : "text-gray-500"}`}
                            >
                              {formatData(t.data_vencimento)}
                            </span>
                          )}
                          {somenteLocacao && (
                            <span
                              className={`text-xs whitespace-nowrap ${situacao === "vencido" ? "text-red-700" : "text-gray-500"}`}
                            >
                              {t.dia_vencimento ?? "—"}
                            </span>
                          )}
                          {somenteLocacao && (
                            <span
                              className={`text-xs whitespace-nowrap font-medium ${
                                situacao === "vencido"
                                  ? "text-red-700"
                                  : situacao === "alerta"
                                  ? "text-amber-700"
                                  : "text-gray-500 font-normal"
                              }`}
                            >
                              {situacao === "vencido"
                                ? "Vencido"
                                : situacao === "alerta"
                                ? `${diasParaVencimento(t.data_vencimento)} dia(s) — renovar/cancelar`
                                : calcularPrazoRestante(t.data_assinatura, t.prazo_contrato_meses)}
                            </span>
                          )}
                          <span
                            className={`text-xs text-right whitespace-nowrap ${situacao === "vencido" ? "text-red-800 font-medium" : "text-gray-600"}`}
                          >
                            {formatMoeda(t.valor_transacao)}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
