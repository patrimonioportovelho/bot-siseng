import { prisma } from "@/lib/prisma";
import {
  AVISO_FIM_EXPEDIENTE_MIN,
  AVISO_TETO_MIN,
  INTERVALO_SINAL_S,
  LIMITE_SEM_SINAL_S,
  NOMES_DIA,
  PONTO_PADRAO,
  emExpediente,
  fimDaSemana,
  formatarMin,
  inicioDaSemana,
  inicioDoDia,
  minutosAteFimDoExpediente,
  minutosEm,
  noAlmoco,
  partesLocais,
  type Intervalo,
  type PontoConfig
} from "@/lib/ponto/regras";

// Lado do servidor do controle de ponto: registra o uso e decide se a pessoa pode
// continuar usando o sistema agora.

export type StatusPonto =
  | { controlado: false }
  | {
      controlado: true;
      semanaMin: number;
      hojeMin: number;
      cargaMin: number;
      noAlmoco: boolean;
      bloqueio: { tipo: "teto" | "fora_expediente"; mensagem: string } | null;
      pedidoPendente: { id: string; motivo: string; minutos: number; solicitadoEm: string } | null;
      extra: { restanteMin: number; validaAte: string } | null;
      aviso: string | null;
    };

export function configDeLinha(l: {
  ativo: boolean;
  carga_semanal_min: number;
  entrada: string;
  saida: string;
  almoco_inicio: string;
  almoco_fim: string;
}): PontoConfig {
  return { ativo: l.ativo, cargaMin: l.carga_semanal_min, entrada: l.entrada, saida: l.saida, almocoInicio: l.almoco_inicio, almocoFim: l.almoco_fim };
}

export async function obterConfigPonto(parceiroId: string): Promise<PontoConfig> {
  const linha = await prisma.ponto_config.findUnique({ where: { parceiro_id: parceiroId } });
  return linha ? configDeLinha(linha) : PONTO_PADRAO;
}

type LinhaSessao = { inicio: Date; ultimo_sinal: Date; fim: Date | null };
const intervaloDe = (s: LinhaSessao): Intervalo => ({ ini: s.inicio.getTime(), fim: (s.fim ?? s.ultimo_sinal).getTime() });

// Períodos de uso (sem os anulados) que tocam [de, ate).
export async function intervalosDoParceiro(parceiroId: string, de: Date, ate: Date): Promise<Intervalo[]> {
  const sessoes = await prisma.ponto_sessoes.findMany({
    where: {
      parceiro_id: parceiroId,
      anulada: false,
      inicio: { lt: ate },
      OR: [{ fim: null, ultimo_sinal: { gt: de } }, { fim: { gt: de } }]
    },
    select: { inicio: true, ultimo_sinal: true, fim: true }
  });
  return sessoes.map(intervaloDe);
}

async function liberacaoAtiva(parceiroId: string, agora: Date) {
  const lista = await prisma.ponto_liberacoes.findMany({
    where: { parceiro_id: parceiroId, status: "aprovada", valida_ate: { gt: agora } },
    orderBy: { valida_ate: "asc" }
  });
  return lista.find((l) => l.usado_seg < (l.minutos_aprovados ?? 0) * 60) ?? null;
}

export async function calcularStatus(parceiroId: string, cfg: PontoConfig, agora: Date): Promise<StatusPonto & { controlado: true }> {
  const semIni = inicioDaSemana(agora);
  const semFim = fimDaSemana(agora);
  const diaIni = inicioDoDia(agora);
  const [intervalos, liberacao, pendente] = await Promise.all([
    intervalosDoParceiro(parceiroId, semIni, semFim),
    liberacaoAtiva(parceiroId, agora),
    prisma.ponto_liberacoes.findFirst({ where: { parceiro_id: parceiroId, status: "pendente" }, orderBy: { solicitado_em: "desc" } })
  ]);
  const semanaMin = minutosEm(intervalos, semIni.getTime(), semFim.getTime());
  const hojeMin = minutosEm(intervalos, diaIni.getTime(), diaIni.getTime() + 86400000);

  const fora = !emExpediente(agora, cfg);
  const teto = semanaMin >= cfg.cargaMin;
  const precisaLiberacao = fora || teto;

  let bloqueio: { tipo: "teto" | "fora_expediente"; mensagem: string } | null = null;
  if (precisaLiberacao && !liberacao) {
    if (teto) {
      bloqueio = { tipo: "teto", mensagem: `Você atingiu o limite semanal de ${formatarMin(cfg.cargaMin)} de uso do sistema.` };
    } else {
      const dia = partesLocais(agora).diaSemana;
      const nomeDia = dia >= 6 ? NOMES_DIA[dia] : `${NOMES_DIA[dia]}-feira`;
      bloqueio = {
        tipo: "fora_expediente",
        mensagem: `Agora é ${nomeDia}, fora do expediente (segunda a sexta, das ${cfg.entrada} às ${cfg.saida}).`
      };
    }
  }

  let aviso: string | null = null;
  if (!bloqueio && !(precisaLiberacao && liberacao)) {
    const faltaFim = minutosAteFimDoExpediente(agora, cfg);
    if (faltaFim > 0 && faltaFim <= AVISO_FIM_EXPEDIENTE_MIN) aviso = `Faltam ${faltaFim} min para o fim do expediente (${cfg.saida}). Depois disso o acesso só continua com liberação da diretoria.`;
    else if (cfg.cargaMin - semanaMin <= AVISO_TETO_MIN) aviso = `Faltam ${formatarMin(cfg.cargaMin - semanaMin)} para o limite semanal. Depois disso o acesso só continua com liberação da diretoria.`;
  }

  return {
    controlado: true,
    semanaMin,
    hojeMin,
    cargaMin: cfg.cargaMin,
    noAlmoco: noAlmoco(agora, cfg),
    bloqueio,
    pedidoPendente: pendente
      ? { id: pendente.id, motivo: pendente.motivo, minutos: pendente.minutos_solicitados, solicitadoEm: pendente.solicitado_em.toISOString() }
      : null,
    extra:
      precisaLiberacao && liberacao
        ? { restanteMin: Math.max(0, Math.ceil(((liberacao.minutos_aprovados ?? 0) * 60 - liberacao.usado_seg) / 60)), validaAte: (liberacao.valida_ate as Date).toISOString() }
        : null,
    aviso
  };
}

// Leitura sem gravar nada (usada na primeira carga da página).
export async function lerStatusPonto(parceiroId: string): Promise<StatusPonto> {
  const cfg = await obterConfigPonto(parceiroId);
  if (!cfg.ativo) return { controlado: false };
  return calcularStatus(parceiroId, cfg, new Date());
}

// Fecha o período em aberto no último sinal de vida (+ até 1 min, que é o intervalo entre sinais).
async function fecharSessao(s: { id: string; ultimo_sinal: Date }, motivo: string, agora: Date) {
  const teto = s.ultimo_sinal.getTime() + INTERVALO_SINAL_S * 1000;
  const fim = new Date(motivo === "fechou" || motivo === "logout" || motivo === "inatividade" ? Math.min(agora.getTime(), teto) : s.ultimo_sinal.getTime());
  await prisma.ponto_sessoes.update({ where: { id: s.id }, data: { fim, motivo_fim: motivo } });
}

export async function fecharSessoesDoParceiro(parceiroId: string, motivo: string) {
  const abertas = await prisma.ponto_sessoes.findMany({ where: { parceiro_id: parceiroId, fim: null }, select: { id: true, ultimo_sinal: true } });
  const agora = new Date();
  await Promise.all(abertas.map((s) => fecharSessao(s, motivo, agora)));
}

// Um sinal de vida (a cada minuto enquanto a pessoa usa a tela) ou a saída (aba fechada).
// Devolve o status atual: se estiver bloqueada, nada é contado.
export async function registrarSinal(parceiroId: string, saida: boolean): Promise<StatusPonto> {
  const agora = new Date();
  const cfg = await obterConfigPonto(parceiroId);
  if (!cfg.ativo) return { controlado: false };

  const abertas = await prisma.ponto_sessoes.findMany({ where: { parceiro_id: parceiroId, fim: null }, orderBy: { inicio: "desc" } });
  let atual: (typeof abertas)[number] | null = abertas[0] ?? null;
  // sobras (duas abas, queda de conexão): só a mais recente fica aberta
  for (const s of abertas.slice(1)) await fecharSessao(s, "duplicada", agora);
  if (atual && (agora.getTime() - atual.ultimo_sinal.getTime()) / 1000 > LIMITE_SEM_SINAL_S) {
    await fecharSessao(atual, "sem_sinal", agora);
    atual = null;
  }

  if (saida) {
    if (atual) await fecharSessao(atual, "fechou", agora);
    return calcularStatus(parceiroId, cfg, agora);
  }

  const antes = await calcularStatus(parceiroId, cfg, agora);
  if (antes.bloqueio) {
    if (atual) await fecharSessao(atual, "bloqueio", agora);
    return antes;
  }

  const sobLiberacao = antes.extra !== null;
  if (!atual) {
    await prisma.ponto_sessoes.create({ data: { parceiro_id: parceiroId, inicio: agora, ultimo_sinal: agora } });
  } else {
    const delta = Math.min(Math.round((agora.getTime() - atual.ultimo_sinal.getTime()) / 1000), 90);
    await prisma.ponto_sessoes.update({
      where: { id: atual.id },
      data: { ultimo_sinal: agora, ...(sobLiberacao ? { segundos_extra: { increment: delta } } : {}) }
    });
    if (sobLiberacao) {
      const lib = await liberacaoAtiva(parceiroId, agora);
      if (lib) await prisma.ponto_liberacoes.update({ where: { id: lib.id }, data: { usado_seg: { increment: delta } } });
    }
  }
  return calcularStatus(parceiroId, cfg, agora);
}
