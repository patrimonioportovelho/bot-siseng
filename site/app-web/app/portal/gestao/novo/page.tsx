import { ConteudoNovoGestao } from "./conteudo";

export const dynamic = "force-dynamic";
// Cadastro "tudo do zero" faz várias consultas em sequência e ainda gera o documento — estende o tempo antes do
// timeout padrão da função (mesmo motivo do portal de Compra e Venda).
export const maxDuration = 30;

// Formulário "Elaboração de Contrato de Gestão" — só corretor logado no portal preenche isso.
export default async function Pagina() {
  return <ConteudoNovoGestao modo="gestao" />;
}
