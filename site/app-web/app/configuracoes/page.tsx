import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { atualizarCpfAdministrativoAction } from "./actions";

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

export default async function ConfiguracoesPage() {
  const [administrativos, lojas, acessos, alteracoes] = await Promise.all([
    prisma.parceiros.findMany({
      where: { funcao: "Administrativo" },
      orderBy: { nome: "asc" }
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
        <div className="text-sm font-bold text-gray-800 mb-1">Acesso administrativo (login por CPF)</div>
        <p className="text-xs text-gray-500 mb-3">
          O login exige nome completo + CPF batendo com o cadastro abaixo. Enquanto o CPF de alguém
          ainda estiver em branco, essa pessoa consegue entrar só com o nome (pra poder cadastrar o
          próprio CPF aqui) — depois de preenchido, o CPF passa a ser exigido de verdade.
        </p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="font-normal py-1.5 border-b border-gray-100">Nome</th>
              <th className="font-normal py-1.5 border-b border-gray-100">E-mail</th>
              <th className="font-normal py-1.5 border-b border-gray-100">Status</th>
              <th className="font-normal py-1.5 border-b border-gray-100 w-56">CPF</th>
            </tr>
          </thead>
          <tbody>
            {administrativos.map((p) => (
              <tr key={p.id}>
                <td className="py-2 border-b border-gray-50 font-medium text-gray-800">{p.nome}</td>
                <td className="py-2 border-b border-gray-50">{p.email ?? "—"}</td>
                <td className="py-2 border-b border-gray-50">{p.status_funcao}</td>
                <td className="py-2 border-b border-gray-50">
                  <form action={atualizarCpfAdministrativoAction} className="flex gap-1.5">
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
            {administrativos.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-gray-400">
                  Nenhum parceiro com função Administrativo.
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
          Vercel em produção). Para trocar, edite lá e reinicie o servidor — não dá pra mudar por aqui
          ainda.
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
