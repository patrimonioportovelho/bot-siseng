import {
  CLASSE_SITUACAO_HONORARIO,
  ROTULO_SITUACAO_HONORARIO,
  type ResumoHonorario
} from "@/lib/financeiro/honorario-lancado";

// Selo da situação do honorário no Financeiro (Não lançado / Pendente /
// Parcial / Pago). "Não se aplica" vira só um traço.
export function SeloHonorario({ resumo }: { resumo: ResumoHonorario | undefined }) {
  if (!resumo || resumo.situacao === "nao_se_aplica") {
    return <span className="text-gray-300">—</span>;
  }
  const detalhe =
    resumo.situacao === "nao_lancado"
      ? "Contrato assinado, mas o Financeiro ainda não lançou o honorário."
      : `${resumo.pagos} de ${resumo.lancamentos} lançamento(s) pago(s) no Financeiro.`;
  return (
    <span
      title={detalhe}
      className={`inline-block text-[10px] font-semibold border rounded-full px-2 py-0.5 whitespace-nowrap ${CLASSE_SITUACAO_HONORARIO[resumo.situacao]}`}
    >
      {ROTULO_SITUACAO_HONORARIO[resumo.situacao]}
    </span>
  );
}
