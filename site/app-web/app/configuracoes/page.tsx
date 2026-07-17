import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { StatusSacSelect } from "@/components/configuracoes/status-sac-select";
import {
  definirSenhaParceiroAction,
  aprovarAcessoAction,
  rejeitarAcessoAction,
  criarPublicacaoAction,
  atualizarPublicacaoAction,
  alternarAtivoPublicacaoAction,
  excluirPublicacaoAction,
  marcarErroVistoAction
} from "./actions";
import { limparErrosAntigos } from "@/lib/erros";

export const dynamic = "force-dynamic";

// O servidor roda em UTC, então sem timeZone explícito o horário aparecia
// adiantado (Porto Velho é UTC-4, sem horário de verão).
function formatDataHora(data: Date) {
  return new Date(data).toLocaleString("pt-BR", { timeZone: "America/Porto_Velho" });
}

const TIPOS_PUBLICACAO = ["Noticia", "Edital", "Checklist"];

function tipoPublicacaoLabel(t: string) {
  if (t === "Edital") return "Edital";
  if (t === "Checklist") return "Checklist";
  return "Notícia";
}

export default async function ConfiguracoesPage({
  searchParams
}: {
  searchParams: Promise<{
    salvo?: string;
    erro?: string;
    aprovado?: string;
    rejeitado?: string;
    salvo_publicacao?: string;
  }>;
}) {
  const { salvo, erro, aprovado, rejeitado, salvo_publicacao } = await searchParams;
  const session = await getAdminSession();

  if (!session) {
    return (
      <div>
        <Topbar />
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
          <p className="text-xs text-gray-500">Sessão inválida — faça login novamente.</p>
        </div>
      </div>
    );
  }

  const isAdm = session.isAdm;

  // Notícias, editais e checklists ficam abertos a qualquer administrativo
  // logado — pedido explícito do usuário. O resto da tela (aprovação de
  // acesso, senha manual, logs de auditoria, lojas, SAC, erros de cadastro)
  // continua só pra isAdm — só a exibição é que fica condicionada (as
  // queries seguem rodando pra todo mundo, são baratas e mantêm os tipos
  // simples, mesmo padrão do resto do arquivo).

  // Erros de cadastro com mais de 3 dias somem sozinhos toda vez que essa
  // página é aberta — dá tempo de revisar sem deixar a tabela crescendo.
  await limparErrosAntigos();

  const [pendentes, parceirosAtivos, lojas, acessos, alteracoes, publicacoes, mensagensSac, errosCadastro] = await Promise.all([
    prisma.solicitacoes_acesso.findMany({
      where: { status: "pendente" },
      orderBy: { criado_em: "asc" },
      include: { parceiros_solicitacoes_acesso_parceiro_idToparceiros: true }
    }),
    prisma.parceiros.findMany({
      where: { status_funcao: "Ativo" },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, funcao: true }
    }),
    prisma.lojas.findMany({ orderBy: { nome: "asc" } }),
    prisma.logs_acesso.findMany({
      orderBy: { criado_em: "desc" },
      take: 20,
      include: { parceiros: true }
    }),
    prisma.logs_alteracao.findMany({
      orderBy: { criado_em: "desc" },
      take: 20,
      include: { parceiros: true }
    }),
    prisma.publicacoes_site.findMany({ orderBy: { publicado_em: "desc" } }),
    prisma.mensagens_sac.findMany({ orderBy: { criado_em: "desc" }, take: 100 }),
    prisma.logs_erro.findMany({
      orderBy: { criado_em: "desc" },
      take: 100,
      include: { parceiros: true }
    })
  ]);

  return (
    <div>
      <Topbar />

      {salvo === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Senha salva com sucesso.
        </div>
      )}
      {aprovado === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Acesso aprovado com sucesso.
        </div>
      )}
      {rejeitado === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Solicitação rejeitada.
        </div>
      )}
      {salvo_publicacao === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Publicação salva com sucesso.
        </div>
      )}
      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mb-4">{erro}</div>
      )}

      {isAdm && (
      <>
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="text-sm font-bold text-gray-800 mb-1">Solicitações de acesso pendentes</div>
        <p className="text-xs text-gray-500 mb-3">
          Qualquer parceiro ativo pode pedir acesso (nome, email e uma senha escolhida na tela de
          login). Aqui você confirma se é mesmo a pessoa antes de liberar — uma vez aprovado, a senha
          escolhida fica valendo no cadastro do parceiro (ver ficha completa em <Link href="/parceiros" className="text-primary">Parceiros</Link>) e o acesso passa a ser direto.
        </p>
        {pendentes.length === 0 ? (
          <p className="text-xs text-gray-400">Nenhuma solicitação pendente.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="font-normal py-1.5 border-b border-gray-100">Parceiro cadastrado</th>
                  <th className="font-normal py-1.5 border-b border-gray-100">Nome informado</th>
                  <th className="font-normal py-1.5 border-b border-gray-100">Email informado</th>
                  <th className="font-normal py-1.5 border-b border-gray-100">Pedido em</th>
                  <th className="font-normal py-1.5 border-b border-gray-100 w-40">Ação</th>
                </tr>
              </thead>
              <tbody>
                {pendentes.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2 border-b border-gray-50 font-medium text-gray-800">
                      {s.parceiros_solicitacoes_acesso_parceiro_idToparceiros.nome}{" "}
                      <span className="text-gray-400">
                        · {s.parceiros_solicitacoes_acesso_parceiro_idToparceiros.funcao}
                      </span>
                    </td>
                    <td className="py-2 border-b border-gray-50">{s.nome_informado}</td>
                    <td className="py-2 border-b border-gray-50">{s.email_informado}</td>
                    <td className="py-2 border-b border-gray-50">{formatDataHora(s.criado_em)}</td>
                    <td className="py-2 border-b border-gray-50">
                      <div className="flex gap-1.5">
                        <form action={aprovarAcessoAction}>
                          <input type="hidden" name="solicitacaoId" value={s.id} />
                          <button type="submit" className="text-xs bg-primary text-white rounded-lg px-2 py-1">
                            Aprovar
                          </button>
                        </form>
                        <form action={rejeitarAcessoAction}>
                          <input type="hidden" name="solicitacaoId" value={s.id} />
                          <button type="submit" className="text-xs border border-gray-300 text-gray-600 rounded-lg px-2 py-1">
                            Rejeitar
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="text-sm font-bold text-gray-800 mb-1">Definir senha manualmente</div>
        <p className="text-xs text-gray-500 mb-3">
          Para liberar (ou trocar) o acesso de alguém sem passar pela solicitação — inclusive a sua
          própria senha. Lembre-se: a pessoa faz login com o <strong>email</strong> já cadastrado na
          ficha dela em <Link href="/parceiros" className="text-primary">Parceiros</Link> + a senha que
          você definir aqui.
        </p>
        <form action={definirSenhaParceiroAction} className="flex gap-2 items-end flex-wrap">
          <div>
            <label className="text-xs text-gray-600 block mb-1">Parceiro</label>
            <select
              name="parceiroId"
              required
              defaultValue=""
              className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-72 outline-none focus:border-primary bg-white"
            >
              <option value="" disabled>
                Selecione...
              </option>
              {parceirosAtivos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} — {p.funcao}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1">Nova senha</label>
            <input
              name="senha"
              required
              placeholder="senha"
              className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-40 outline-none focus:border-primary"
            />
          </div>
          <button type="submit" className="text-xs bg-primary text-white rounded-lg px-3 py-1.5">
            Salvar
          </button>
        </form>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="text-sm font-bold text-gray-800 mb-1">Portal externo do corretor</div>
        <p className="text-xs text-gray-500">
          A senha de acesso do portal (<code>/portal</code>) fica na variável{" "}
          <code>PORTAL_CORRETOR_SENHA</code> do arquivo <code>.env</code> (e nas variáveis de ambiente da
          Vercel em produção). Para trocar, edite lá e reinicie o servidor.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">Lojas</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="font-normal py-1.5 border-b border-gray-100">Nome</th>
                  <th className="font-normal py-1.5 border-b border-gray-100">Cidade</th>
                  <th className="font-normal py-1.5 border-b border-gray-100">Estado</th>
                </tr>
              </thead>
              <tbody>
                {lojas.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 border-b border-gray-50">{l.nome}</td>
                    <td className="py-2 border-b border-gray-50">{l.cidade ?? "—"}</td>
                    <td className="py-2 border-b border-gray-50">{l.estado ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">Últimos acessos ao sistema</div>
          <div className="flex flex-col gap-1.5 max-h-64 overflow-auto">
            {acessos.map((a) => (
              <div key={a.id} className="text-xs text-gray-600 border-b border-gray-50 pb-1.5">
                <span className="font-medium text-gray-800">{a.parceiros?.nome ?? "—"}</span>{" "}
                <span className="text-gray-400">
                  · {a.acao} ({a.tipo_portal}) · {formatDataHora(a.criado_em)}
                </span>
              </div>
            ))}
            {acessos.length === 0 && <p className="text-xs text-gray-400">Nenhum acesso registrado ainda.</p>}
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Log de alterações recentes</div>
        <div className="flex flex-col gap-1.5 max-h-64 overflow-auto">
          {alteracoes.map((a) => (
            <div key={a.id} className="text-xs text-gray-600 border-b border-gray-50 pb-1.5">
              <span className="font-medium text-gray-800">{a.parceiros?.nome ?? "Sistema"}</span>{" "}
              <span className="text-gray-400">
                · {a.acao} em {a.entidade_tipo} · {formatDataHora(a.criado_em)}
              </span>
            </div>
          ))}
          {alteracoes.length === 0 && <p className="text-xs text-gray-400">Nenhuma alteração registrada ainda.</p>}
        </div>
      </div>
      </>)}

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="text-sm font-bold text-gray-800 mb-1">Notícias, editais e checklists</div>
        <p className="text-xs text-gray-500 mb-3">
          Notícias e editais aparecem na página pública (fora do login), na seção "Notícias e editais", e
          também no mural do Portal do Corretor se marcar essa opção abaixo. Checklists nunca aparecem na
          página pública — só no mural do Portal do Corretor (para isso, marque "Mostrar também no mural do
          Portal do Corretor"). Desative em vez de excluir se só quiser tirar de circulação por enquanto —
          excluir apaga o registro e a imagem de vez.
        </p>

        <details className="mb-4 bg-gray-50/50 border border-dashed border-gray-200 rounded-lg">
          <summary className="text-xs font-semibold text-gray-700 cursor-pointer px-3 py-2">
            + Nova publicação
          </summary>
          <form action={criarPublicacaoAction} className="p-3 pt-0 flex flex-col gap-2">
            <div className="grid md:grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600 block mb-1">Tipo</label>
                <select
                  name="tipo"
                  defaultValue="Noticia"
                  className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white"
                >
                  {TIPOS_PUBLICACAO.map((t) => (
                    <option key={t} value={t}>
                      {tipoPublicacaoLabel(t)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">Título</label>
                <input
                  name="titulo"
                  required
                  className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Resumo (opcional, aparece na lista)</label>
              <input
                name="resumo"
                className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Texto completo</label>
              <textarea
                name="corpo"
                required
                className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary min-h-24"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Imagem (opcional)</label>
              <input
                type="file"
                name="imagem"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white file:mr-2 file:text-xs file:border-0 file:bg-gray-100 file:rounded file:px-2 file:py-1"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                Recomendado: imagem quadrada, 1080x1080px (o mesmo tamanho de um post pronto pra WhatsApp/Instagram).
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" name="ativo" defaultChecked /> Publicar já (visível no site)
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" name="portal_corretor" /> Mostrar também no mural do Portal do Corretor
            </label>
            <div>
              <button type="submit" className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold">
                Salvar publicação
              </button>
            </div>
          </form>
        </details>

        {publicacoes.length === 0 ? (
          <p className="text-xs text-gray-400">Nenhuma publicação cadastrada ainda.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {publicacoes.map((p) => (
              <details key={p.id} className="border border-gray-200 rounded-lg">
                <summary className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer text-xs">
                  <span className="flex items-center gap-2 min-w-0">
                    {p.imagem_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imagem_url}
                        alt=""
                        className="w-7 h-7 rounded object-cover shrink-0 border border-gray-200"
                      />
                    )}
                    <span
                      className={`text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border shrink-0 ${
                        p.ativo
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-gray-50 text-gray-500 border-gray-200"
                      }`}
                    >
                      {p.ativo ? "Ativa" : "Inativa"}
                    </span>
                    <span className="text-gray-400 shrink-0">{tipoPublicacaoLabel(p.tipo)}</span>
                    {p.portal_corretor && (
                      <span className="text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border shrink-0 bg-blue-50 text-blue-700 border-blue-200">
                        Portal
                      </span>
                    )}
                    <span className="font-medium text-gray-800 truncate">{p.titulo}</span>
                  </span>
                  <span className="text-gray-400 shrink-0">{formatDataHora(p.publicado_em)}</span>
                </summary>
                <div className="p-3 pt-0">
                  <form action={atualizarPublicacaoAction} className="flex flex-col gap-2 mb-2">
                    <input type="hidden" name="publicacaoId" value={p.id} />
                    <div className="grid md:grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-600 block mb-1">Tipo</label>
                        <select
                          name="tipo"
                          defaultValue={p.tipo}
                          className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white"
                        >
                          {TIPOS_PUBLICACAO.map((t) => (
                            <option key={t} value={t}>
                              {tipoPublicacaoLabel(t)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-600 block mb-1">Título</label>
                        <input
                          name="titulo"
                          required
                          defaultValue={p.titulo}
                          className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">Resumo</label>
                      <input
                        name="resumo"
                        defaultValue={p.resumo ?? ""}
                        className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">Texto completo</label>
                      <textarea
                        name="corpo"
                        required
                        defaultValue={p.corpo}
                        className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary min-h-24"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">Imagem</label>
                      {p.imagem_url && (
                        <div className="flex items-center gap-2 mb-1.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.imagem_url}
                            alt=""
                            className="w-14 h-14 rounded-lg object-cover border border-gray-200"
                          />
                          <label className="flex items-center gap-1.5 text-xs text-red-600">
                            <input type="checkbox" name="remover_imagem" /> Remover imagem atual
                          </label>
                        </div>
                      )}
                      <input
                        type="file"
                        name="imagem"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white file:mr-2 file:text-xs file:border-0 file:bg-gray-100 file:rounded file:px-2 file:py-1"
                      />
                      <p className="text-[10px] text-gray-400 mt-1">
                        {p.imagem_url
                          ? "Escolha um arquivo pra trocar a imagem atual. Recomendado: 1080x1080px."
                          : "Recomendado: imagem quadrada, 1080x1080px."}
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-gray-600">
                      <input type="checkbox" name="ativo" defaultChecked={p.ativo} /> Publicada (visível no site)
                    </label>
                    <label className="flex items-center gap-2 text-xs text-gray-600">
                      <input type="checkbox" name="portal_corretor" defaultChecked={p.portal_corretor} /> Mostrar
                      também no mural do Portal do Corretor
                    </label>
                    <div>
                      <button
                        type="submit"
                        className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold"
                      >
                        Salvar alterações
                      </button>
                    </div>
                  </form>
                  <div className="flex gap-1.5">
                    <form action={alternarAtivoPublicacaoAction}>
                      <input type="hidden" name="publicacaoId" value={p.id} />
                      <button
                        type="submit"
                        className="text-xs border border-gray-300 text-gray-600 rounded-lg px-2 py-1"
                      >
                        {p.ativo ? "Desativar" : "Ativar"}
                      </button>
                    </form>
                    <form action={excluirPublicacaoAction}>
                      <input type="hidden" name="publicacaoId" value={p.id} />
                      <button type="submit" className="text-xs border border-red-200 text-red-600 rounded-lg px-2 py-1">
                        Excluir
                      </button>
                    </form>
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>

      {isAdm && (
      <>
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-1">Mensagens do SAC</div>
        <p className="text-xs text-gray-500 mb-3">
          Enviadas pelo formulário de contato do site público. Não manda e-mail automático — acompanhe e
          marque o andamento aqui.
        </p>
        {mensagensSac.length === 0 ? (
          <p className="text-xs text-gray-400">Nenhuma mensagem recebida ainda.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {mensagensSac.map((m) => (
              <details key={m.id} className="border border-gray-200 rounded-lg">
                <summary className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer text-xs">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-gray-800 truncate">{m.nome}</span>
                    {m.assunto && <span className="text-gray-400 truncate">· {m.assunto}</span>}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-gray-400">{formatDataHora(m.criado_em)}</span>
                    <StatusSacSelect mensagemId={m.id} statusAtual={m.status} />
                  </span>
                </summary>
                <div className="px-3 pb-3 text-xs text-gray-600">
                  <div className="mb-1">
                    <span className="text-gray-400">E-mail:</span> {m.email}
                    {m.telefone && (
                      <>
                        {" "}
                        <span className="text-gray-400">· Telefone:</span> {m.telefone}
                      </>
                    )}
                  </div>
                  <p className="whitespace-pre-line bg-gray-50 border border-gray-100 rounded-lg p-2">
                    {m.mensagem}
                  </p>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mt-4">
        <div className="text-sm font-bold text-gray-800 mb-1">Erros de cadastro</div>
        <p className="text-xs text-gray-500 mb-3">
          Erros de salvamento em Clientes, Imóveis, Transações, Administrações e Parceiros ficam
          registrados aqui — antes disso, um erro só aparecia na tela na hora e sumia. Marque como
          visto depois de conferir e resolver. Somem sozinhos depois de 3 dias, pra não acumular.
        </p>
        {errosCadastro.length === 0 ? (
          <p className="text-xs text-gray-400">Nenhum erro registrado ainda.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {errosCadastro.map((e) => (
              <details key={e.id} className="border border-gray-200 rounded-lg">
                <summary className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer text-xs">
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className={`text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border shrink-0 ${
                        e.visto
                          ? "bg-gray-50 text-gray-500 border-gray-200"
                          : "bg-red-50 text-red-700 border-red-200"
                      }`}
                    >
                      {e.visto ? "Visto" : "Novo"}
                    </span>
                    <span className="text-gray-400 shrink-0">
                      {e.acao} em {e.entidade_tipo}
                    </span>
                    <span className="font-medium text-gray-800 truncate">{e.mensagem}</span>
                  </span>
                  <span className="text-gray-400 shrink-0">{formatDataHora(e.criado_em)}</span>
                </summary>
                <div className="px-3 pb-3 text-xs text-gray-600">
                  <div className="mb-1">
                    <span className="text-gray-400">Quem tentou:</span> {e.parceiros?.nome ?? "—"}
                  </div>
                  {e.mensagem_tecnica && (
                    <p className="whitespace-pre-line bg-gray-50 border border-gray-100 rounded-lg p-2 font-mono text-[11px] mb-2">
                      {e.mensagem_tecnica}
                    </p>
                  )}
                  {!e.visto && (
                    <form action={marcarErroVistoAction}>
                      <input type="hidden" name="erroId" value={e.id} />
                      <button type="submit" className="text-xs border border-gray-300 text-gray-600 rounded-lg px-2 py-1">
                        Marcar como visto
                      </button>
                    </form>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
      </>)}
    </div>
  );
}
