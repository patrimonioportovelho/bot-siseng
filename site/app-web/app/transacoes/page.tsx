import { redirect } from "next/navigation";

// "Transações" virou dois itens separados no menu (Locação e Compra e
// Venda — ficava difícil de bater o olho misturado). Quem cair aqui direto
// (link antigo, favorito etc.) vai parar em Locação por padrão.
export default function TransacoesIndexPage() {
  redirect("/transacoes/locacao");
}
