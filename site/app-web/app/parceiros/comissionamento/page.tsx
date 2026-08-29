import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { FUNCOES_CORRETOR } from "@/lib/transacoes/opcoes";
import { ComissionamentoLoteForm } from "@/components/comissionamento-lote-form";
import { buscarSugestoesComissionamento } from "@/lib/parceiros/recuperar-comissionamento";

export const dynamic = "force-dynamic";

// Revisão/preenchimento em lote de % Proprietário e % Interessado de todo
// Corretor/Corretor Estagiário — criada em 16/08/2026 depois de um
// `prisma db push` ter apagado os valores antigos (porc_compr/porc_vend,
// sem backup disponível no plano Free do Supabase). Também serve pra achar
// cadastro que nunca teve o comissionamento preenchido (destacado em
// amarelo) — usuário: "nem todos tem ainda pode ser erro de cadastro do
// administrativo".
//
// 29/08/2026 — usuário pediu pra ir além: "veja quais já tiveram e traga de
// volta". Pra quem está com campo vazio, buscamos no log de auditoria
// (logs_alteracao) se algum valor antigo ficou preservado ali (ver
// lib/parceiros/recuperar-comissionamento.ts) e PRÉ-PREENCHEMOS o campo como
// sugestão — quem já tem valor no cadastro nunca é tocado/sugerido, e nada é
// salvo até o administrativo revisar e clicar em "Salvar tudo".
export default async function ComissionamentoPage({
  searchParams
}: {
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { salvo } = await searchParams;

  const parceirosBrutos = await prisma.parceiros.findMany({
    where: { funcao: { in: FUNCOES_CORRETOR }, status_funcao: { not: "Excluído" } },
    orderBy: [{ status_funcao: "asc" }, { nome: "asc" }],
    select: { id: true, nome: true, funcao: true, status_funcao: true, porc_proprietario: true, porc_interessado: true }
  });

  const parceirosBase = parceirosBrutos.map((p) => ({
    id: p.id,
    nome: p.nome,
    funcao: p.funcao,
    status_funcao: p.status_funcao,
    porcProprietario: p.porc_proprietario != null ? Number(p.porc_proprietario) : null,
    porcInteressado: p.porc_interessado != null ? Number(p.porc_interessado) : null
  }));

  const idsComFaltante = parceirosBase.filter((p) => p.porcProprietario == null || p.porcInteressado == null).map((p) => p.id);
  const sugestoes = await buscarSugestoesComissionamento(idsComFaltante);

  const parceiros = parceirosBase.map((p) => {
    const sugestao = sugestoes.get(p.id);
    return {
      ...p,
      // Só oferece sugestão pro campo que está vazio hoje — se já tem valor,
      // sugestaoX fica null e o campo mostra só o valor real, sem rótulo.
      sugestaoProprietario: p.porcProprietario == null ? (sugestao?.proprietario ?? null) : null,
      sugestaoInteressado: p.porcInteressado == null ? (sugestao?.interessado ?? null) : null,
      sugestaoFonteProprietario: p.porcProprietario == null ? (sugestao?.fonteProprietario ?? null) : null,
      sugestaoFonteInteressado: p.porcInteressado == null ? (sugestao?.fonteInteressado ?? null) : null
    };
  });

  const semNenhum = parceiros.filter((p) => p.porcProprietario == null && p.porcInteressado == null).length;
  const comSugestao = parceiros.filter((p) => p.sugestaoProprietario != null || p.sugestaoInteressado != null).length;

  return (
    <div>
      <Topbar />

      <Link href="/parceiros" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para Parceiros
      </Link>

      <div className="text-sm font-bold text-gray-800 mb-1">Comissionamento em lote</div>
      <p className="text-xs text-gray-500 mb-4">
        % Proprietário e % Interessado de cada Corretor/Corretor Estagiário — usado pra pré-preencher automaticamente
        quando ele é escolhido numa transação nova.
        {semNenhum > 0 && (
          <span className="text-amber-600 font-semibold"> {semNenhum} sem nenhum percentual preenchido ainda.</span>
        )}
        {comSugestao > 0 && (
          <span className="text-primary font-semibold">
            {" "}
            {comSugestao} {comSugestao === 1 ? "tem" : "têm"} valor antigo recuperado do histórico abaixo — confira e clique em
            &quot;Salvar tudo&quot; pra confirmar.
          </span>
        )}
      </p>

      {salvo === "1" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-4">
          Comissionamento salvo com sucesso.
        </div>
      )}

      {parceiros.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
          Nenhum Corretor ou Corretor Estagiário cadastrado.
        </div>
      ) : (
        <ComissionamentoLoteForm parceiros={parceiros} />
      )}
    </div>
  );
}
