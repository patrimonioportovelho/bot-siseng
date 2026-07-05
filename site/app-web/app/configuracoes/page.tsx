import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { atualizarCpfParceiroAction, aprovarAcessoAction, rejeitarAcessoAction } from "./actions";

export const dynamic = "force-dynamic";

function formatCpf(cpf: string | null) {
  if (!cpf) return "";
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatDataHora(data: Date) {
  return new Date(data).toLocaleString("pt-BR");
}

export default async function ConfiguracoesPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await getAdminSession();
  const { q } = await searchParams;
  const termo = (q ?? "").trim();

  if (!session?.isAdm) {
    return (
      <div>
        <Topbar />
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <div className="text-sm font-bold text-gray-800 mb-2">Configurações</div>
          <p className="text-sm text-gray-500">
            Seu acesso ao SisEng está liberado. As configurações avançadas (aprovação de acessos,
            CPFs e logs de auditoria) ficam visíveis apenas para administradores.
          </p>
        </div>
      </div>
    );
  }

  const [pendentes, parceiros, lojas, acessos, alteracoes] = await Promise.all([
    prisma.solicitacoes_acesso.findMany({
      where: { status: "pendente" },
      orderBy: { criado_em: "asc" },
      include: { parceiros_solicitacoes_acesso_parceiro_idToparceiros: true }
    }),
    prisma.parceiros.findMany({
      where: termo
        ? {
            OR: [
              { nome: { contains: termo, mode: "insensitive" } },
              { funcao: { contains: termo, mode: "insensitive" } }
            ]
          }
        : undefined,
      orderBy: { nome: "asc" },
      take: 100
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
    })
  ]);

  return (
    <div>
      <Topbar />

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="text-sm font-bold text-gray-800 mb-1">Solicitações de acesso pendentes</div>
        <p className="text-xs text-gray-500 mb-3">
          Qualquer parceiro ativo pode pedir acesso (nome + CPF na tela de login). Aqui você confirma
          se o CPF informado é mesmo da pessoa antes de liberar — uma vez aprovado, o CPF fica
          registrado no cadastro do parceiro e o acesso passa a ser direto.
        </p>
        {pendentes.length === 0 ? (
          <p className="text-xs text-gray-400">Nenhuma solicitação pendente.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="font-normal py-1.5 border-b border-gray-100">Parceiro cadastrado</th>
                <th className="font-normal py-1.5 border-b border-gray-100">Nome informado</th>
                <th className="font-normal py-1.5 border-b border-gray-100">CPF informado</th>
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
                  <td className="py-2 border-b border-gray-50">{formatCpf(s.cpf_informado)}</td>
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
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-gray-800">Parceiros e acesso ({parceiros.length})</div>
          <form className="flex gap-2">
            <input
              type="text"
              name="q"
              defaultValue={termo}
              placeholder="Buscar por nome ou função..."
              className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-64 outline-none focus:border-primary"
            />
            <button type="submit" className="text-xs bg-primary text-white rounded-lg px-3 py-1.5">
              Buscar
            </button>
          </form>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="font-normal py-1.5 border-b border-gray-100">Nome</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Função</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Status</th>
              <th className="font-normal py-1.5 border-b border-gray-100 w-56">CPF</th>
            </tr>
          </thead>
          <tbody>
            {parceiros.map((p) => (
              <tr key={p.id}>
                <td className="py-2 border-b border-gray-50 font-medium text-gray-800">{p.nome}</td>
                <td className="py-2 border-b border-gray-50">{p.funcao}</td>
                <td className="py-2 border-b border-gray-50">{p.status_funcao}</td>
                <td className="py-2 border-b border-gray-50">
                  <form action={atualizarCpfParceiroAction} className="flex gap-1.5">
                    <input type="hidden" name="parceiroId" value={p.id} />
                    <input
                      name="cpf"
                      defaultValue={formatCpf(p.cpf)}
                      placeholder="000.000.000-00"
                      className="text-xs border border-gray-300 rounded-lg px-2 py-1 w-36 outline-none focus:border-primary"
                    />
                    <button type="submit" className="text-xs bg-primary text-white rounded-lg px-2 py-1">
                      Salvar
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {parceiros.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-gray-400">
                  Nenhum parceiro encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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

      <div className="bg-white border border-gray-200 rounded-xl p-4">
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
    </div>
  );
}
