import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { BotaoSubmit } from "@/components/botao-submit";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { EventoForm } from "@/components/evento-form";
import { AtaForm } from "@/components/ata-form";
import { EmailEventoForm } from "@/components/email-evento-form";
import { listarParceirosAdministrativos } from "@/lib/parceiros/administrativos";
import { FUNCOES_EQUIPE } from "@/lib/parceiros/opcoes";
import { funcoesPermitidas, convidadoPaga, valorDevidoConvidado, valorEventoAgora, confirmacaoIsenta } from "@/lib/eventos/opcoes";
import { proximaOcorrencia } from "@/lib/eventos/ocorrencias";
import { gerarPixCopiaECola } from "@/lib/eventos/pix";
import { PixAdminToggle } from "@/components/pix-admin-toggle";
import {
  atualizarEventoAction,
  apagarEventoAction,
  alternarPagoInscricaoAction,
  apagarInscricaoAction,
  alternarPagoConfirmacaoAction,
  alternarIsencaoConfirmacaoAction
} from "../actions";

function formatDataCurta(d: Date) {
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export const dynamic = "force-dynamic";

export default async function EventoDetalhePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string; erro?: string }>;
}) {
  const { id } = await params;
  const { salvo, erro } = await searchParams;
  const session = await getAdminSession();

  const [evento, organizadores] = await Promise.all([
    prisma.eventos.findUnique({ where: { id } }),
    listarParceirosAdministrativos()
  ]);

  if (!evento || evento.excluido) notFound();

  // Resumo de presença/ausência — só faz sentido pra evento aberto no portal
  // (portal_corretor); os demais nem aparecem lá pro corretor confirmar.
  // "Pendente" não é uma linha salva (ver app/portal/eventos/actions.ts):
  // é calculado aqui, por diferença entre quem É elegível (pela visibilidade)
  // e quem já respondeu.
  //
  // Fase 5 (10/08/2026): confirmação é por ocorrência (evento recorrente
  // pede "vai/não vai" de novo a cada vez) — o resumo aqui mostra sempre a
  // PRÓXIMA ocorrência (a que ainda está em aberto pra responder). Se não
  // houver mais nenhuma (recorrência encerrada), cai pra data_inicio como
  // referência, só pra não ficar sem nenhum rótulo de data no card.
  const ocorrenciaAlvo =
    proximaOcorrencia(evento.data_inicio, evento.recorrencia, evento.recorrencia_ate, new Date()) ?? evento.data_inicio;

  let confirmacoes: {
    id: string;
    status: string;
    respondido_em: Date | null;
    parceiro_id: string;
    nome: string;
    funcao: string;
    leva_convidado: boolean | null;
    quantidade_pessoas: number | null;
    pago: boolean;
    pago_isento: boolean | null;
  }[] = [];
  let pendentes: { id: string; nome: string }[] = [];
  if (evento.portal_corretor) {
    const funcoes = funcoesPermitidas(evento.visibilidade) ?? FUNCOES_EQUIPE;
    const [confirmacoesEvento, elegiveis] = await Promise.all([
      prisma.eventos_confirmacoes.findMany({
        where: { evento_id: id, ocorrencia_data: ocorrenciaAlvo },
        select: {
          id: true,
          status: true,
          respondido_em: true,
          parceiro_id: true,
          leva_convidado: true,
          quantidade_pessoas: true,
          pago: true,
          pago_isento: true,
          parceiros: { select: { nome: true, funcao: true } }
        },
        orderBy: { respondido_em: "desc" }
      }),
      prisma.parceiros.findMany({
        where: { funcao: { in: funcoes }, status_funcao: "Ativo" },
        orderBy: { nome: "asc" },
        select: { id: true, nome: true }
      })
    ]);
    confirmacoes = confirmacoesEvento.map((c) => ({
      id: c.id,
      status: c.status,
      respondido_em: c.respondido_em,
      parceiro_id: c.parceiro_id,
      nome: c.parceiros.nome,
      funcao: c.parceiros.funcao,
      leva_convidado: c.leva_convidado,
      quantidade_pessoas: c.quantidade_pessoas,
      pago: c.pago,
      pago_isento: c.pago_isento
    }));
    const responderamIds = new Set(confirmacoesEvento.map((c) => c.parceiro_id));
    pendentes = elegiveis.filter((p) => !responderamIds.has(p.id));
  }
  const confirmados = confirmacoes.filter((c) => c.status === "Confirmado");
  const recusados = confirmacoes.filter((c) => c.status === "Recusado");

  // Pagamento do evento pago pra quem confirmou (Fase 7, 14/08/2026) — só
  // faz diferença quando evento.pago = true (senão devido fica sempre 0).
  // valorEventoNumero já considera o desconto por antecedência (ver
  // lib/eventos/opcoes.ts#valorEventoAgora — antes disso o desconto era só
  // texto solto na página pública, nunca calculado de verdade).
  const valorEventoNumero = valorEventoAgora(
    evento.valor ? Number(evento.valor) : null,
    evento.tem_desconto,
    evento.valor_desconto ? Number(evento.valor_desconto) : null,
    evento.desconto_prazo,
    new Date()
  );

  // Inscrições do Formulário Básico/Completo (Fase 3, 10/08/2026) — só
  // busca quando o evento chegou a ter o formulário ativo em algum momento
  // (se já tiver resposta salva, mostra mesmo que o admin tenha desativado
  // depois — não faz sentido esconder quem já se inscreveu).
  const inscricoes = await prisma.eventos_inscricoes.findMany({
    where: { evento_id: id },
    orderBy: { created_at: "desc" },
    include: { parceiros: { select: { nome: true } } }
  });

  // Resumo por convidado (Fase 6, 12/08/2026: "controle da quantidade é
  // essencial") — quanto cada inscrição deve (idade x valor/idade grátis do
  // evento) e agrupado por quem convidou, pra corretor e admin verem de
  // uma vez quantos convidados + quanto falta receber. Só faz sentido
  // calcular quando o evento tem cobrança de convidado configurada.
  const valorConvidadoNumero = evento.valor_convidado ? Number(evento.valor_convidado) : null;
  const inscricoesComValor = inscricoes.map((i) => ({
    ...i,
    paga: convidadoPaga(i.idade, evento.convidado_idade_gratis_ate),
    devido: valorDevidoConvidado(i.idade, evento.convidado_idade_gratis_ate, valorConvidadoNumero)
  }));
  const resumoPorConvite = new Map<
    string,
    { nome: string; total: number; pagantes: number; gratis: number; devido: number; recebido: number }
  >();
  for (const i of inscricoesComValor) {
    const chave = i.convidado_por_id ?? "sem-convite";
    const nome = i.parceiros?.nome ?? "Sem convite definido";
    const atual = resumoPorConvite.get(chave) ?? { nome, total: 0, pagantes: 0, gratis: 0, devido: 0, recebido: 0 };
    atual.total += 1;
    if (i.paga) atual.pagantes += 1;
    else atual.gratis += 1;
    atual.devido += i.devido;
    if (i.pago) atual.recebido += i.devido;
    resumoPorConvite.set(chave, atual);
  }
  const resumoConvidados = Array.from(resumoPorConvite.values()).sort((a, b) => b.total - a.total);
  const totalDevidoGeral = inscricoesComValor.reduce((soma, i) => soma + i.devido, 0);
  const totalRecebidoGeral = inscricoesComValor.reduce((soma, i) => soma + (i.pago ? i.devido : 0), 0);

  // "+N convidados" ao lado do nome em Presença/ausência (Fase 6e,
  // 14/08/2026: usuário reportou "eu Jota Silvestre por enquanto estou com
  // 1 convidado em baixo, e em cima está +2"). Bug: esse badge usava
  // eventos_confirmacoes.leva_convidado/quantidade_pessoas — o formulário
  // interno ANTIGO (Fase 3), que fica travado com o número respondido lá
  // atrás e nem é mais coletado no Portal pra evento com o sistema novo de
  // convidados (ver "tira essa parte" em app/portal/eventos/page.tsx). Pra
  // evento com formulario_inscricao ativo, o número de verdade é a contagem
  // real de eventos_inscricoes por convidado_por_id — já calculada acima em
  // resumoPorConvite. Sem formulario_inscricao (evento só com o formulário
  // interno de sempre), continua usando leva_convidado/quantidade_pessoas
  // normalmente — não muda nada pra quem nunca usou o sistema novo.
  const confirmacoesComConvidados = confirmacoes.map((c) => {
    const isento = confirmacaoIsenta(c.funcao, evento.pago_funcoes_isentas, c.pago_isento);
    return {
      ...c,
      quantidadeConvidadosReal: evento.formulario_inscricao ? (resumoPorConvite.get(c.parceiro_id)?.total ?? 0) : null,
      isento,
      devido: !isento && valorEventoNumero ? valorEventoNumero : 0
    };
  });

  return (
    <div>
      <Topbar />

      <div className="flex items-center justify-between mb-3">
        <Link href="/eventos" className="text-xs text-gray-500 hover:text-gray-800">
          ← Voltar para Eventos
        </Link>
        {session?.isAdm && (
          <form action={apagarEventoAction}>
            <input type="hidden" name="eventoId" value={evento.id} />
            <button
              type="submit"
              className="text-xs border border-red-200 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-50"
            >
              Apagar evento
            </button>
          </form>
        )}
      </div>

      {salvo === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Evento salvo com sucesso.
        </div>
      )}
      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mb-4">{erro}</div>
      )}

      <div className="text-sm font-bold text-gray-800 mb-1">{evento.nome}</div>
      {evento.id_legado && <div className="text-xs text-gray-400 mb-4">{evento.id_legado}</div>}

      {evento.portal_corretor && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
          <div className="text-sm font-bold text-gray-800 mb-1">
            Presença/ausência
            {evento.recorrencia !== "Nenhuma" && (
              <span className="text-gray-400 font-normal"> — ocorrência de {formatDataCurta(ocorrenciaAlvo)}</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Respostas de quem viu este evento no Portal do Corretor. Quem ainda não abriu o Portal ou não respondeu
            conta como "não respondeu".
            {evento.recorrencia !== "Nenhuma" &&
              " Evento recorrente: cada ocorrência pede confirmação de novo — isto é só a de cima."}
          </p>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-green-50 border border-green-100 rounded-lg p-2.5 text-center">
              <div className="text-base font-bold text-green-700">{confirmados.length}</div>
              <div className="text-[11px] text-green-700">Confirmaram</div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-lg p-2.5 text-center">
              <div className="text-base font-bold text-red-600">{recusados.length}</div>
              <div className="text-[11px] text-red-600">Não vão</div>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-lg p-2.5 text-center">
              <div className="text-base font-bold text-gray-600">{pendentes.length}</div>
              <div className="text-[11px] text-gray-500">Não responderam</div>
            </div>
          </div>
          {/* Pagamento do evento (Fase 7, 14/08/2026: "vamos consolidar o
              pagamento dessa forma... chamar essa geração de pix por
              enquanto e controle de pagamento manual") — quando o evento
              cobra, cada confirmado ganha uma linha detalhada (Pix + Marcar
              pago + Isentar/Cobrar) igual ao que já existe pra convidado.
              Sem cobrança, mantém as pastilhas simples de sempre. */}
          {evento.pago ? (
            <div className="flex flex-col gap-2">
              {confirmacoesComConvidados
                .filter((c) => c.status === "Confirmado")
                .map((c) => (
                  <div key={c.id} className="border border-gray-100 rounded-lg p-2.5 text-xs text-gray-600">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="font-semibold text-gray-800">
                        {c.nome}
                        <span className="text-gray-400 font-normal"> · {c.funcao}</span>
                        {evento.formulario_inscricao && c.quantidadeConvidadosReal !== null && c.quantidadeConvidadosReal > 0 && (
                          <span className="text-gray-400 font-normal">
                            {" "}
                            · +{c.quantidadeConvidadosReal} convidado{c.quantidadeConvidadosReal > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border ${
                            c.isento
                              ? "bg-gray-50 text-gray-500 border-gray-200"
                              : c.pago
                                ? "bg-green-50 text-green-700 border-green-200"
                                : "bg-red-50 text-red-600 border-red-200"
                          }`}
                        >
                          {c.isento ? "Isento" : c.pago ? "Pago" : `Deve ${formatMoeda(c.devido)}`}
                        </span>
                        {!c.isento && (
                          <form action={alternarPagoConfirmacaoAction}>
                            <input type="hidden" name="confirmacaoId" value={c.id} />
                            <BotaoSubmit
                              variante="secundario"
                              carregandoTexto={c.pago ? "Desmarcando..." : "Marcando..."}
                              className="text-[10px] text-primary font-semibold hover:underline"
                            >
                              {c.pago ? "Desmarcar" : "Marcar pago"}
                            </BotaoSubmit>
                          </form>
                        )}
                        <form action={alternarIsencaoConfirmacaoAction}>
                          <input type="hidden" name="confirmacaoId" value={c.id} />
                          <BotaoSubmit variante="secundario" className="text-[10px] text-gray-400 font-semibold hover:underline">
                            {c.pago_isento === null
                              ? c.isento
                                ? "Cobrar mesmo assim"
                                : "Isentar"
                              : "Voltar à regra da função"}
                          </BotaoSubmit>
                        </form>
                      </div>
                    </div>
                    {!c.isento && !c.pago && c.devido > 0 && (
                      <div className="mt-1.5">
                        <PixAdminToggle
                          valor={c.devido}
                          codigo={gerarPixCopiaECola({ valor: c.devido, descricao: "Convite" })}
                        />
                      </div>
                    )}
                  </div>
                ))}
              {recusados.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {recusados.map((c) => (
                    <span key={c.id} className="text-[11px] rounded-full px-2 py-0.5 border bg-red-50 text-red-600 border-red-200">
                      {c.nome}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            confirmacoesComConvidados.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {confirmacoesComConvidados.map((c) => (
                  <span
                    key={c.id}
                    className={`text-[11px] rounded-full px-2 py-0.5 border ${
                      c.status === "Confirmado"
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-red-50 text-red-600 border-red-200"
                    }`}
                  >
                    {c.nome}
                    {c.status === "Confirmado" &&
                      (evento.formulario_inscricao
                        ? c.quantidadeConvidadosReal !== null &&
                          c.quantidadeConvidadosReal > 0 && (
                            <>
                              {" "}
                              · +{c.quantidadeConvidadosReal} convidado{c.quantidadeConvidadosReal > 1 ? "s" : ""}
                            </>
                          )
                        : c.leva_convidado && (
                            <> · +{c.quantidade_pessoas ?? "?"} convidado{(c.quantidade_pessoas ?? 0) > 1 ? "s" : ""}</>
                          ))}
                  </span>
                ))}
              </div>
            )
          )}
        </div>
      )}

      {(evento.formulario_inscricao || inscricoes.length > 0) && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
          <div className="text-sm font-bold text-gray-800 mb-1">
            Inscrições ({inscricoes.length})
          </div>
          <p className="text-xs text-gray-500 mb-3">Respostas do formulário de inscrição pública na página do evento.</p>

          {evento.cobra_convidado && inscricoes.length > 0 && (
            <div className="mb-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-2.5 text-center">
                  <div className="text-base font-bold text-gray-800">{inscricoes.length}</div>
                  <div className="text-[11px] text-gray-500">Convidados</div>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-2.5 text-center">
                  <div className="text-base font-bold text-gray-800">{formatMoeda(totalDevidoGeral)}</div>
                  <div className="text-[11px] text-gray-500">A receber (total)</div>
                </div>
                <div className="bg-green-50 border border-green-100 rounded-lg p-2.5 text-center">
                  <div className="text-base font-bold text-green-700">{formatMoeda(totalRecebidoGeral)}</div>
                  <div className="text-[11px] text-green-700">Já recebido</div>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5 text-center">
                  <div className="text-base font-bold text-amber-700">
                    {formatMoeda(totalDevidoGeral - totalRecebidoGeral)}
                  </div>
                  <div className="text-[11px] text-amber-700">Faltando</div>
                </div>
              </div>
              <div className="text-[11px] font-semibold text-gray-600 mb-1">Por quem convidou</div>
              <div className="flex flex-col gap-1">
                {resumoConvidados.map((r) => (
                  <div
                    key={r.nome}
                    className="flex items-center justify-between gap-2 text-xs text-gray-600 border-b border-gray-50 py-1"
                  >
                    <span className="truncate flex-1 min-w-0">
                      {r.nome} — {r.total} convidado{r.total !== 1 ? "s" : ""}
                      {r.gratis > 0 && ` (${r.gratis} criança${r.gratis !== 1 ? "s" : ""})`}
                    </span>
                    <span className="text-gray-400 whitespace-nowrap">
                      {formatMoeda(r.recebido)} / {formatMoeda(r.devido)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {inscricoes.length === 0 ? (
            <p className="text-xs text-gray-400">Ninguém se inscreveu ainda.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {inscricoesComValor.map((i) => (
                <div key={i.id} className="border border-gray-100 rounded-lg p-2.5 text-xs text-gray-600">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="font-semibold text-gray-800">
                      {i.nome}
                      {i.idade !== null && <span className="text-gray-400 font-normal"> · {i.idade} anos</span>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {evento.cobra_convidado && (
                        <>
                          <span
                            className={`text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border ${
                              !i.paga
                                ? "bg-gray-50 text-gray-500 border-gray-200"
                                : i.pago
                                  ? "bg-green-50 text-green-700 border-green-200"
                                  : "bg-red-50 text-red-600 border-red-200"
                            }`}
                          >
                            {!i.paga ? "Grátis" : i.pago ? "Pago" : `Deve ${formatMoeda(i.devido)}`}
                          </span>
                          {i.paga && (
                            <form action={alternarPagoInscricaoAction}>
                              <input type="hidden" name="inscricaoId" value={i.id} />
                              <BotaoSubmit
                                variante="secundario"
                                carregandoTexto={i.pago ? "Desmarcando..." : "Marcando..."}
                                className="text-[10px] text-primary font-semibold hover:underline"
                              >
                                {i.pago ? "Desmarcar" : "Marcar pago"}
                              </BotaoSubmit>
                            </form>
                          )}
                        </>
                      )}
                      {/* Apagar convidado (Fase 6b, 12/08/2026: "coloca botão
                          para apagar o convidado"). Só existe aqui, na lista
                          de eventos_inscricoes — Administrativo/Corretor/
                          Corretor Estagiário respondem presença em
                          eventos_confirmacoes (outra tabela, sem delete
                          nenhum, pedido explícito do usuário: "esses só podem
                          confirmar se vão ou não, não podem ser apagados"). */}
                      <form action={apagarInscricaoAction}>
                        <input type="hidden" name="inscricaoId" value={i.id} />
                        <BotaoSubmit variante="perigo" carregandoTexto="Apagando..." className="text-[10px] text-red-500 font-semibold hover:underline">
                          Apagar
                        </BotaoSubmit>
                      </form>
                    </div>
                  </div>
                  {(i.email || i.telefone) && (
                    <div>
                      {/* Podem ser null (Fase 6, 12/08/2026) — convidado sem
                          contato próprio, cadastrado por alguém da equipe
                          (ver convidado_por_id logo abaixo). */}
                      {[i.email, i.telefone].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  {(i.endereco || i.profissao || i.especialidade) && (
                    <div className="text-gray-500">
                      {[i.endereco, i.profissao, i.especialidade].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  {i.parceiros && <div className="text-gray-400">Convidado(a) por {i.parceiros.nome}</div>}
                  {i.paga && !i.pago && (
                    <div className="mt-1">
                      <PixAdminToggle
                        valor={i.devido}
                        codigo={gerarPixCopiaECola({ valor: i.devido, descricao: "Convite" })}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <EmailEventoForm eventoId={evento.id} />

      {evento.tipo === "Reunião" && <AtaForm eventoId={evento.id} />}

      <EventoForm evento={evento} organizadores={organizadores} action={atualizarEventoAction} />
    </div>
  );
}
