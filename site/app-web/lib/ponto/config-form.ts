import { prisma } from "@/lib/prisma";
import { PONTO_PADRAO, hhmmParaMin, pessoaTemPonto } from "@/lib/ponto/regras";

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

// Lê a caixa "Controle de ponto" do formulário de Acessos e grava a jornada. Só
// grava quando a caixa apareceu (campo ponto_presente) e a pessoa tem um acesso
// controlado. Devolve a mensagem de erro, se algum campo estiver inválido.
export async function salvarConfigPontoDoForm(
  parceiroId: string,
  formData: FormData,
  adminId: string,
  acessosEscolhidos: string[]
): Promise<string | null> {
  if (formData.get("ponto_presente") !== "1") return null;
  if (!pessoaTemPonto({ acessos: acessosEscolhidos })) return null;

  const ativo = formData.get("ponto_ativo") === "on";
  const horas = Number(String(formData.get("ponto_carga_h") ?? "").replace(",", "."));
  const entrada = String(formData.get("ponto_entrada") ?? "");
  const saida = String(formData.get("ponto_saida") ?? "");
  const almocoIni = String(formData.get("ponto_almoco_inicio") ?? "");
  const almocoFim = String(formData.get("ponto_almoco_fim") ?? "");

  if (!Number.isFinite(horas) || horas < 1 || horas > 60) return "O teto semanal precisa ficar entre 1 e 60 horas.";
  if (![entrada, saida, almocoIni, almocoFim].every((h) => HORA.test(h))) return "Informe os horários de entrada, saída e almoço.";
  if (hhmmParaMin(saida) <= hhmmParaMin(entrada)) return "A saída precisa ser depois da entrada.";
  if (hhmmParaMin(almocoFim) <= hhmmParaMin(almocoIni)) return "O fim do almoço precisa ser depois do início.";

  const dados = {
    ativo,
    carga_semanal_min: Math.round(horas * 60),
    entrada,
    saida,
    almoco_inicio: almocoIni,
    almoco_fim: almocoFim,
    updated_at: new Date(),
    updated_by: adminId
  };
  await prisma.ponto_config.upsert({ where: { parceiro_id: parceiroId }, create: { parceiro_id: parceiroId, ...dados }, update: dados });
  return null;
}

export { PONTO_PADRAO };
