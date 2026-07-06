import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatMoeda, formatData, calcularPrazoRestante, STATUS_TRANSACAO_TODOS } from "@/lib/format";

// Listagem compartilhada por /transacoes/locacao e /transacoes/venda — cada
// uma chama isso com o Tipo já fixo (menu separado, sem aba de trocar tipo).
// Agrupa por Loja e, dentro da loja, por Status (mesmo padrão da tela de
// Administrações). Linha inteira é clicável e abre o detalhe.
export async function TransacoesLista({ tipo, q, novoHref }: { tipo: "Locação" | "Compra e Venda"; q?: string; novoHref: string }) {
  const termo = (q ?? "").trim();
  const somenteLocacao = tipo === "Locação";

  const where = {
    tipo,
    ...(termo
      ? {
          OR: [
            { imoveis: { endereco: { contains: termo, mode: "insensitive" as const } } },
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
  // sempre visível, mesmo padrão usado em Administrações.
  const colunas = somenteLocacao
    ? "grid-cols-[0.8fr_1.3fr_1.1fr_1.1fr_auto_auto_auto_auto]"
    : "grid-cols-[0.8fr_1.6fr_1.4fr_1.4fr_auto_auto]";

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
              return (
                <div key={status} className="mb-3 last:mb-0">
                  <div className="text-[11px] font-semibold text-gray-500 px-3 py-1">
                    {status} ({doStatus.length})
                  </div>
                  <div className={`grid ${colunas} gap-3 px-3 py-1 text-[11px] text-gray-400 border-b border-gray-100`}>
                    <span>Id</span>
                    <span>Imóvel</span>
                    <span>Cliente Proprietário</span>
                    <span>Cliente Interessado</span>
                    <span>Assinatura</span>
                    {somenteLocacao && <span>Dia venc.</span>}
                    {somenteLocacao && <span>Prazo restante</span>}
                    <span className="text-right">Valor</span>
                  </div>
                  <div className="flex flex-col">
                    {doStatus.map((t) => {
                      const proprietarios = t.imoveis?.imoveis_proprietarios.map((v) => v.clientes) ?? [];
                      const interessados = t.transacoes_contrapartes.map((v) => v.clientes);
                      return (
                        <Link
                          key={t.id}
                          href={`/transacoes/${t.id}`}
                          className={`grid ${colunas} gap-3 items-center px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors`}
                        >
                          <span className="text-xs text-gray-500 truncate">{t.id_legado ?? t.id}</span>
                          <span className="text-xs text-gray-500 truncate">{t.imoveis?.endereco ?? "—"}</span>
                          <span className="text-xs font-medium text-gray-800 truncate">
                            {proprietarios[0]?.nome ?? "—"}
                            {proprietarios.length > 1 && (
                              <span className="text-gray-400 font-normal"> +{proprietarios.length - 1}</span>
                            )}
                          </span>
                          <span className="text-xs text-gray-700 truncate">
                            {interessados[0]?.nome ?? "—"}
                            {interessados.length > 1 && (
                              <span className="text-gray-400 font-normal"> +{interessados.length - 1}</span>
                            )}
                          </span>
                          <span className="text-xs text-gray-500 whitespace-nowrap">{formatData(t.data_assinatura)}</span>
                          {somenteLocacao && (
                            <span className="text-xs text-gray-500 whitespace-nowrap">{t.dia_vencimento ?? "—"}</span>
                          )}
                          {somenteLocacao && (
                            <span className="text-xs text-gray-500 whitespace-nowrap">
                              {calcularPrazoRestante(t.data_assinatura, t.prazo_contrato_meses)}
                            </span>
                          )}
                          <span className="text-xs text-gray-600 text-right whitespace-nowrap">
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
