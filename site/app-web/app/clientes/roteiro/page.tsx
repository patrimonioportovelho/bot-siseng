import Link from "next/link";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { RoteiroEditor } from "@/components/roteiro-editor";
import { requireAdminSession } from "@/lib/auth";
import { acessosDaSessao, nivelEmModulos } from "@/lib/acessos";
import { carregarEdicoes } from "@/lib/crm/roteiro-edicoes-servidor";
import { salvarPerguntaDoRoteiroAction } from "./actions";

export const dynamic = "force-dynamic";

// Tela do administrativo para ajustar textos e opções do roteiro de atendimento sem mexer no código.
export default async function EditarRoteiroPage() {
  const sessao = await requireAdminSession();
  if (nivelEmModulos(acessosDaSessao(sessao), ["clientes"]) !== "editar") redirect("/clientes/funil");
  const edicoes = await carregarEdicoes();

  return (
    <div>
      <Topbar />
      <Link href="/clientes/funil" className="text-xs text-gray-500 hover:text-gray-800 inline-block mb-3">
        ← Voltar para o Kanban de Clientes
      </Link>
      <div className="text-lg font-bold text-gray-900 mb-1">Editar roteiro de atendimento</div>
      <p className="text-xs text-gray-500 mb-5 max-w-3xl">
        Ajuste as perguntas, as falas sugeridas e as opções. Dá para esconder uma opção ou criar uma nova que funcione igual a outra já existente. A ordem das
        perguntas e os caminhos não são alterados aqui. Nas falas, use [Nome], [Assistente], [Imobiliária] e [imóvel]: o sistema preenche na hora.
      </p>
      <RoteiroEditor edicoes={edicoes} salvar={salvarPerguntaDoRoteiroAction} />
    </div>
  );
}
