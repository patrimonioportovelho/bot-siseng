import { ConteudoNovoGestao } from "@/app/portal/gestao/novo/conteudo";

export const dynamic = "force-dynamic";
// Cadastro "tudo do zero" faz várias consultas em sequência e ainda gera o documento — estende o tempo antes do
// timeout padrão da função (mesmo motivo do portal de Compra e Venda).
export const maxDuration = 30;

// Formulário "Ficha de Captação" (imóvel sem gestão/exclusividade) — mesmo formato do contrato de gestão.
export default async function Pagina() {
  return <ConteudoNovoGestao modo="captacao" />;
}
