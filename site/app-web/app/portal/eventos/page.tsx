import { PortalHeader } from "@/components/portal-header";
import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { podeVerEvento, recorrenciaLabel } from "@/lib/eventos/opcoes";
import { proximaOcorrencia } from "@/lib/eventos/ocorrencias";
import { confirmarPresencaEventoAction, recusarPresencaEventoAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  Pendente: "Ainda não respondeu",
  Confirmado: "Presença confirmada",
  Recusado: "Ausência avisada"
};

const STATUS_COR: Record<string, string> = {
  Pendente: "bg-gray-50 text-gray-500 border-gray-200",
  Confirmado: "bg-green-50 text-green-700 border-green-200",
  Recusado: "bg-red-50 text-red-600 border-red-200"
};

function formatData(data: Date) {
  return new Date(data).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Porto_Velho" });
}

// Compara só a data (ignora hora) — usado pra achar, entre as confirmações
// desse parceiro pra esse evento (pode ter uma por ocorrência passada, ver
// Fase 5, 10/08/2026), a que é da ocorrência que está sendo exibida agora.
function mesmaData(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

// Eventos abertos a este corretor (portal_corretor marcado + visibilidade
// bate com a função dele) — com botão de confirmar/recusar presença
// (eventos_confirmacoes, criada só quando ele responde, ver ./actions.ts).
export default async function PortalEventosPage() {
  const session = await requirePortalSession();
  const agora = new Date();

  const [parceiro, eventosBrutos] = await Promise.all([
    prisma.parceiros.findUnique({ where: { id: session.parceiroId }, select: { funcao: true } }),
    prisma.eventos.findMany({
      where: { excluido: false, ativo: true, portal_corretor: true, publicado_em: { lte: agora } },
      orderBy: { data_inicio: "asc" },
      include: {
        parceiros: true,
        eventos_confirmacoes: { where: { parceiro_id: session.parceiroId } }
      }
    })
  ]);

  const eventos = eventosBrutos
    .filter((ev) => podeVerEvento(ev.visibilidade, parceiro?.funcao ?? null))
    .map((ev) => {
      const proxima = proximaOcorrencia(ev.data_inicio, ev.recorrencia, ev.recorrencia_ate, agora);
      // Fase 5 (10/08/2026): confirmação é por ocorrência — entre as linhas
      // desse parceiro pra esse evento (pode haver mais de uma, uma por
      // ocorrência já respondida), acha a que bate com a ocorrência atual.
      // Sem isso, ter confirmado a reunião de uma semana atrás mostraria
      // "Confirmado" pra sempre nas seguintes.
      const confirmacao = proxima
        ? ev.eventos_confirmacoes.find((c) => c.ocorrencia_data && mesmaData(c.ocorrencia_data, proxima))
        : undefined;
      return {
        ev,
        proxima,
        status: confirmacao?.status ?? "Pendente",
        levaConvidado: confirmacao?.leva_convidado ?? null,
        quantidadePessoas: confirmacao?.quantidade_pessoas ?? null,
        observacoes: confirmacao?.observacoes ?? null
      };
    })
    .filter((x) => x.proxima !== null)
    .sort((a, b) => a.proxima!.getTime() - b.proxima!.getTime());

  // Texto do resumo do formulário interno, depois de já confirmado — só
  // monta se tiver algo além do "Presença confirmada" padrão do badge.
  function detalheFormularioInterno(levaConvidado: boolean | null, quantidadePessoas: number | null, observacoes: string | null): string | null {
    const partes: string[] = [];
    if (levaConvidado) partes.push(`Vai levar convidado${quantidadePessoas ? ` (${quantidadePessoas} pessoa${quantidadePessoas > 1 ? "s" : ""})` : ""}.`);
    else if (levaConvidado === false) partes.push("Não vai levar convidado.");
    if (observacoes) partes.push(observacoes);
    return partes.length > 0 ? partes.join(" ") : null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader nome={session.nome} />

      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="text-lg font-bold text-gray-900 mb-1">Eventos</div>
        <p className="text-xs text-gray-500 mb-6">
          Reuniões, treinamentos e outros eventos abertos pra você. Confirme presença ou avise que não vai — ajuda o
          escritório a se organizar.
        </p>

        {eventos.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-400">
            Nenhum evento aberto pra você no momento.
          </div>
        )}

        <div className="flex flex-col gap-3">
          {eventos.map(({ ev, proxima, status, levaConvidado, quantidadePessoas, observacoes }) => (
            <div key={ev.id} className="bg-white border border-gray-200 rounded-xl p-4 flex gap-3">
              {ev.imagem_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ev.imagem_url} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                  <div className="text-sm font-bold text-gray-800">{ev.nome}</div>
                  <span className={`text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border shrink-0 ${STATUS_COR[status]}`}>
                    {STATUS_LABEL[status]}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mb-2 flex items-center gap-1.5 flex-wrap">
                  <span>{formatData(proxima!)}</span>
                  {(ev.horario_inicio || ev.horario_fim) && (
                    <span>
                      · {ev.horario_inicio ?? "—"}
                      {ev.horario_fim ? ` às ${ev.horario_fim}` : ""}
                    </span>
                  )}
                  {ev.local && <span>· {ev.local}</span>}
                  {ev.recorrencia !== "Nenhuma" && <span>· {recorrenciaLabel(ev.recorrencia)}</span>}
                </div>
                {ev.descricao && <p className="text-xs text-gray-600 mb-2 whitespace-pre-line">{ev.descricao}</p>}

                {/* Formulário interno (Fase 3, 10/08/2026): campos extras só
                    quando o evento pede — vão junto com "Confirmar presença"
                    no mesmo envio (ver responder() em ./actions.ts). */}
                {ev.formulario_interno && status !== "Confirmado" && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 mb-2 flex flex-col gap-1.5">
                    <div className="text-[11px] font-semibold text-gray-600">Vai levar convidado?</div>
                    <div className="flex items-center gap-3 text-xs text-gray-600">
                      <label className="flex items-center gap-1">
                        <input type="radio" name="leva_convidado" value="sim" form={`form-confirmar-${ev.id}`} /> Sim
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          name="leva_convidado"
                          value="nao"
                          form={`form-confirmar-${ev.id}`}
                          defaultChecked
                        />{" "}
                        Não
                      </label>
                      <input
                        type="number"
                        min={1}
                        placeholder="Quantas pessoas"
                        name="quantidade_pessoas"
                        form={`form-confirmar-${ev.id}`}
                        className="text-xs border border-gray-300 rounded-lg px-2 py-1 w-28 outline-none focus:border-primary bg-white"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="Observações (opcional)"
                      name="observacoes"
                      form={`form-confirmar-${ev.id}`}
                      className="text-xs border border-gray-300 rounded-lg px-2 py-1 w-full outline-none focus:border-primary bg-white"
                    />
                  </div>
                )}

                <div className="flex gap-1.5">
                  {/* leva_convidado/quantidade_pessoas/observacoes acima ficam
                      fora deste <form> (pra caber no layout do card) mas
                      apontam pra cá via atributo form= — mesmo "dono" de
                      formulário, então entram no FormData desta submissão
                      normalmente (ver responder() em ./actions.ts). */}
                  <form id={`form-confirmar-${ev.id}`} action={confirmarPresencaEventoAction}>
                    <input type="hidden" name="eventoId" value={ev.id} />
                    <button
                      type="submit"
                      disabled={status === "Confirmado"}
                      className="text-xs border border-green-200 text-green-700 rounded-lg px-2 py-1 disabled:opacity-50"
                    >
                      Confirmar presença
                    </button>
                  </form>
                  <form action={recusarPresencaEventoAction}>
                    <input type="hidden" name="eventoId" value={ev.id} />
                    <button
                      type="submit"
                      disabled={status === "Recusado"}
                      className="text-xs border border-red-200 text-red-600 rounded-lg px-2 py-1 disabled:opacity-50"
                    >
                      Não vou poder ir
                    </button>
                  </form>
                </div>
                {ev.formulario_interno &&
                  status === "Confirmado" &&
                  detalheFormularioInterno(levaConvidado, quantidadePessoas, observacoes) && (
                    <p className="text-[11px] text-gray-400 mt-1">
                      {detalheFormularioInterno(levaConvidado, quantidadePessoas, observacoes)}
                    </p>
                  )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
