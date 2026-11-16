import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { BotaoSubmit } from "@/components/botao-submit";
import { prisma } from "@/lib/prisma";
import { resolverUrlDocumentoGerado } from "@/lib/supabase-admin";
import { GestaoEditarForm } from "@/components/gestao-editar-form";
import { GestaoChecklist } from "@/components/gestao-checklist";
import { GestaoAtividades } from "@/components/gestao-atividades";
import { GestaoAnuncioPendente } from "@/components/gestao-anuncio-pendente";
import { anuncioPendente } from "@/lib/gestoes/anuncio";
import { formatData } from "@/lib/format";
import { CAMPOS_FICHA, ESCOLHAS_FICHA, GRUPOS_FICHA, fichaDoJson } from "@/lib/gestoes/ficha";
import {
  atualizarGestaoAction,
  apagarGestaoAction,
  adicionarChecklistItemAction,
  marcarChecklistItemAction,
  removerChecklistItemAction,
  criarAtividadeAction,
  marcarAtividadeFeitaAction,
  removerAtividadeAction,
  adicionarNotaAction,
  confirmarAnuncioAction
} from "../actions";

export const dynamic = "force-dynamic";

export default async function GestaoDetalhePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { id } = await params;
  const { salvo } = await searchParams;

  const gestao = await prisma.gestoes.findUnique({
    where: { id },
    include: {
      imoveis: {
        select: {
          id: true,
          id_legado: true,
          endereco: true,
          anuncio_id: true,
          anuncio_url: true,
          imoveis_proprietarios: { orderBy: { ordem: "asc" }, include: { clientes: { select: { id: true, nome: true } } } }
        }
      },
      clientes: { select: { id: true, nome: true } },
      parceiros: { select: { nome: true } },
      checklist_itens: { orderBy: { ordem: "asc" } },
      atividades: { orderBy: { data: "asc" } },
      notas: { orderBy: { criado_em: "desc" } }
    }
  });
  if (!gestao) notFound();

  const [parceiros, ultimoDocumento, clientes] = await Promise.all([
    prisma.parceiros.findMany({
      where: { funcao: "Corretor", status_funcao: "Ativo" },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true }
    }),
    prisma.documentos_gerados.findFirst({
      where: { entidade_tipo: "gestao", entidade_id: gestao.id, tipo_documento: gestao.tipo === "captacao" ? "ficha_captacao" : "contrato_gestao", status: "Sucesso" },
      orderBy: { gerado_em: "desc" }
    }),
    // Pra oferecer "+ Adicionar proprietário" direto na ficha da Gestão (ver
    // components/adicionar-proprietario-imovel.tsx) — mesma lista de
    // clientes já usada em Transações/Administração pra essa mesma busca.
    prisma.clientes.findMany({
      where: { OR: [{ status_cadastro: null }, { status_cadastro: { not: "Arquivado" } }] },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, id_legado: true, parceiro_id: true }
    })
  ]);

  // Resolve a URL na hora de renderizar — cobre tanto o registro antigo
  // (arquivo_url do bucket público) quanto o novo (arquivo_caminho,
  // resolvido por URL assinada fresca a cada carregamento da tela; ver
  // resolverUrlDocumentoGerado em lib/supabase-admin.ts).
  const urlDocumento = ultimoDocumento ? await resolverUrlDocumentoGerado(ultimoDocumento) : null;

  const outrosProprietarios = gestao.imoveis.imoveis_proprietarios
    .map((v) => v.clientes)
    .filter((c) => c.nome !== gestao.clientes.nome);

  const todosProprietarios = [{ id: gestao.clientes.id, nome: gestao.clientes.nome }, ...outrosProprietarios];

  return (
    <div>
      <Topbar />

      {/* Card que já estava em Comercialização antes da pergunta do anúncio existir: pede a confirmação ao abrir. */}
      {anuncioPendente(gestao, gestao.imoveis.anuncio_id) && (
        <GestaoAnuncioPendente
          gestaoId={gestao.id}
          endereco={gestao.imoveis.endereco ?? gestao.imoveis.id_legado ?? "Imóvel"}
          confirmar={confirmarAnuncioAction}
        />
      )}

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <Link href="/gestoes" className="text-xs text-gray-500 hover:text-gray-800">
          ← Voltar para Gestões / Captações
        </Link>
        {!gestao.excluido && (
          <form action={apagarGestaoAction}>
            <input type="hidden" name="gestaoId" value={gestao.id} />
            <BotaoSubmit variante="perigo" carregandoTexto="Apagando..." className="text-xs border border-red-200 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-50">
              Apagar cadastro
            </BotaoSubmit>
          </form>
        )}
      </div>

      {salvo === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Gestão salva com sucesso.
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <div className="text-sm font-bold text-gray-800">
            {gestao.imoveis.endereco ?? gestao.imoveis.id_legado ?? "Imóvel"}
            <span
              className={`ml-2 align-middle text-[10px] font-bold rounded-full border px-2 py-0.5 ${
                gestao.tipo === "captacao" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-indigo-50 text-indigo-700 border-indigo-200"
              }`}
            >
              {gestao.tipo === "captacao" ? "Captação (sem exclusividade)" : "Gestão (exclusividade)"}
            </span>
          </div>
          <Link href={`/imoveis/${gestao.imoveis.id}`} className="text-xs text-primary font-semibold hover:underline">
            Abrir imóvel →
          </Link>
        </div>
        <div className="text-xs text-gray-400">
          Id imóvel: {gestao.imoveis.id_legado ?? gestao.imoveis.id} · Cliente principal: {gestao.clientes.nome}
          {gestao.parceiros?.nome ? ` · Corretor: ${gestao.parceiros.nome}` : ""}
        </div>
        {outrosProprietarios.length > 0 && (
          <div className="text-xs text-gray-400 mt-1">
            Demais assinantes: {outrosProprietarios.map((c) => c.nome).join(", ")}
          </div>
        )}
        {urlDocumento && ultimoDocumento && (
          <a
            href={urlDocumento}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary underline inline-block mt-2"
          >
            {gestao.tipo === "captacao" ? "Ver ficha de captação gerada" : "Ver contrato de gestão gerado"} ({formatData(ultimoDocumento.gerado_em)})
          </a>
        )}
      </div>

      {gestao.tipo === "captacao" && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
          <div className="text-sm font-bold text-gray-800 mb-2">Ficha de captação</div>
          {(() => {
            const f = fichaDoJson(gestao.ficha);
            const escolhas = ESCOLHAS_FICHA.filter((e) => (f.escolhas[e.id] ?? []).length > 0);
            const campos = CAMPOS_FICHA.filter((c) => f.campos[c.id]);
            const grupos = GRUPOS_FICHA.filter((g) => (f.grupos[g.id] ?? []).length > 0);
            if (escolhas.length + campos.length + grupos.length === 0 && !f.descricaoAnuncios && !f.comentarioInterno) {
              return <p className="text-xs text-gray-400">Nenhuma característica marcada.</p>;
            }
            return (
              <div className="flex flex-col gap-2 text-xs text-gray-700">
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  {escolhas.map((e) => (
                    <span key={e.id}>
                      <span className="text-gray-400">{e.rotulo}: </span>
                      {(f.escolhas[e.id] ?? []).join(", ")}
                    </span>
                  ))}
                  {campos.map((c) => (
                    <span key={c.id}>
                      <span className="text-gray-400">{c.rotulo}: </span>
                      {f.campos[c.id]}
                    </span>
                  ))}
                </div>
                {grupos.map((g) => (
                  <div key={g.id}>
                    <span className="text-gray-400">{g.titulo}: </span>
                    {(f.grupos[g.id] ?? []).join(", ")}
                  </div>
                ))}
                {f.caracteristicasObs && (
                  <div>
                    <span className="text-gray-400">Observações: </span>
                    {f.caracteristicasObs}
                  </div>
                )}
                {f.descricaoAnuncios && (
                  <div>
                    <span className="text-gray-400">Anúncio: </span>
                    {f.descricaoAnuncios}
                  </div>
                )}
                {f.comentarioInterno && (
                  <div>
                    <span className="text-gray-400">Comentário interno: </span>
                    {f.comentarioInterno}
                  </div>
                )}
              </div>
            );
          })()}
          <p className="text-[11px] text-gray-400 mt-2">
            Honorários combinados: {gestao.porc_honorario != null ? `${(Number(gestao.porc_honorario) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : "não informado"}. Para
            gerar a ficha de novo, use Documentos &gt; Gerar documentos &gt; Ficha de captação.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-5">
        <GestaoEditarForm
          gestao={gestao}
          parceiros={parceiros}
          clientes={clientes}
          proprietariosAtuais={todosProprietarios}
          imovel={{ endereco: gestao.imoveis.endereco, anuncio_id: gestao.imoveis.anuncio_id, anuncio_url: gestao.imoveis.anuncio_url }}
          action={atualizarGestaoAction}
        />

        <GestaoChecklist
          gestaoId={gestao.id}
          itens={gestao.checklist_itens}
          adicionar={adicionarChecklistItemAction}
          marcar={marcarChecklistItemAction}
          remover={removerChecklistItemAction}
        />

        <GestaoAtividades
          gestaoId={gestao.id}
          atividades={gestao.atividades}
          adicionar={criarAtividadeAction}
          marcarFeita={marcarAtividadeFeitaAction}
          remover={removerAtividadeAction}
        />

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">Notas</div>
          <form action={adicionarNotaAction} className="flex gap-2 mb-4">
            <input type="hidden" name="gestaoId" value={gestao.id} />
            <input
              name="texto"
              placeholder="Escreva uma nota..."
              className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 flex-1 outline-none focus:border-primary"
              required
            />
            <BotaoSubmit carregandoTexto="Adicionando..." className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap">
              + Adicionar nota
            </BotaoSubmit>
          </form>
          <div className="flex flex-col gap-2">
            {gestao.notas.map((n) => (
              <div key={n.id} className="border border-gray-100 rounded-lg px-3 py-2">
                <div className="text-xs text-gray-700">{n.texto}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">{formatData(n.criado_em)}</div>
              </div>
            ))}
            {gestao.notas.length === 0 && <p className="text-xs text-gray-400">Nenhuma nota ainda.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
