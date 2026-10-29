import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { hojeInputDate } from "@/lib/format";
import { RecrutamentoTurmas, type TurmaTela } from "@/components/recrutamento-turmas";
import { alternarTreinamentoAction, criarTurmaAction, salvarCampoTurmaAction } from "../actions";
import type { EstadoTreinamentos } from "@/lib/recrutamento/treinamentos";

export const dynamic = "force-dynamic";

function iso(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : null;
}

// Turmas quinzenais (9 Passos + específicos + acolhida): calendário, presença
// de cada recrutado e a regra dos 100%. Acolhida em até 30 dias do início.
export default async function TurmasPage() {
  await requireAdminSession();

  const turmas = await prisma.recrutamento_turmas.findMany({
    orderBy: { inicio: "asc" },
    include: {
      recrutamento: {
        select: {
          treinamentos: true,
          acolhida_em: true,
          parceiros: { select: { id: true, nome: true, funcao: true, status_funcao: true } }
        }
      }
    }
  });

  const hoje = hojeInputDate();
  // A "turma da vez": primeira cuja acolhida ainda não passou (abre aberta).
  const indiceAtual = turmas.findIndex((t) => (iso(t.acolhida) ?? iso(t.inicio)!) >= hoje);

  const dados: TurmaTela[] = turmas.map((t, i) => ({
    id: t.id,
    nome: t.nome,
    inicio: iso(t.inicio)!,
    passosInicio: iso(t.passos_inicio),
    passosFim: iso(t.passos_fim),
    especificosA: iso(t.especificos_a),
    especificosB: iso(t.especificos_b),
    acolhida: iso(t.acolhida),
    observacao: t.observacao,
    aberta: i === indiceAtual || t.recrutamento.length > 0,
    participantes: t.recrutamento
      .filter((r) => r.parceiros.status_funcao !== "Excluído")
      .map((r) => ({
        id: r.parceiros.id,
        nome: r.parceiros.nome,
        funcao: r.parceiros.funcao,
        treinamentos: ((r.treinamentos as EstadoTreinamentos | null) ?? {}) as EstadoTreinamentos,
        acolhidaEm: iso(r.acolhida_em)
      }))
  }));

  return (
    <div>
      <Topbar />
      <Link href="/recrutamento" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para Recrutamento
      </Link>
      <div className="mb-3">
        <div className="text-sm font-bold text-gray-800">Turmas</div>
        <div className="text-[11px] text-gray-400">
          Duas turmas por mês, uma por quinzena. 9 Passos (16h) na 1ª semana e 2 tardes de específicos na 2ª. Acolhida e acessos só para
          quem fez 100%, em até 30 dias do início da turma. As datas editáveis servem para ajustar feriados.
        </div>
      </div>
      <RecrutamentoTurmas
        turmas={dados}
        hoje={hoje}
        acoes={{
          salvarCampoTurma: salvarCampoTurmaAction,
          alternarTreinamento: alternarTreinamentoAction,
          criarTurma: criarTurmaAction
        }}
      />
    </div>
  );
}
