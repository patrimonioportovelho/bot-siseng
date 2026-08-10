// Calcula em quais datas um evento acontece dentro de um intervalo — usado
// pelos calendários (admin em app/manutencao/calendario e do portal em
// app/portal/agenda) pra "expandir" um evento recorrente em várias células
// do mês. Não materializa nada no banco (ver eventos.recorrencia em
// prisma/schema.prisma): a única linha salva é a primeira ocorrência
// (data_inicio); as demais são calculadas aqui, em memória, sempre que
// alguém olha um mês.
export function ocorrenciasNoIntervalo(
  dataInicio: Date,
  recorrencia: string,
  recorrenciaAte: Date | null,
  intervaloInicio: Date,
  intervaloFim: Date
): Date[] {
  // Evento único: só entra na lista se a própria data cair dentro do mês
  // pedido.
  if (recorrencia === "Nenhuma" || !recorrenciaAte) {
    return dataInicio >= intervaloInicio && dataInicio < intervaloFim ? [dataInicio] : [];
  }

  const limite = recorrenciaAte < intervaloFim ? recorrenciaAte : new Date(intervaloFim.getTime() - 1);
  if (dataInicio > limite) return [];

  const passoDias = recorrencia === "Diária" ? 1 : recorrencia === "Semanal" ? 7 : null;

  // Pra Diária/Semanal, pula direto pro primeiro passo que já cai dentro (ou
  // depois) do intervalo pedido, em vez de contar passo a passo desde o
  // início do evento — importante pra um evento recorrente criado há anos
  // não precisar de milhares de iterações só pra chegar no mês de hoje.
  let atual = new Date(dataInicio);
  if (passoDias !== null && intervaloInicio > dataInicio) {
    const diasPassados = Math.floor((intervaloInicio.getTime() - dataInicio.getTime()) / 86400000);
    const passosCompletos = Math.floor(diasPassados / passoDias);
    atual.setDate(atual.getDate() + passosCompletos * passoDias);
    while (atual < dataInicio) atual.setDate(atual.getDate() + passoDias);
  }

  function avancar(d: Date): Date {
    const proximo = new Date(d);
    if (passoDias !== null) proximo.setDate(proximo.getDate() + passoDias);
    else if (recorrencia === "Mensal") proximo.setMonth(proximo.getMonth() + 1);
    else return recorrenciaAte!; // recorrência desconhecida — para no primeiro passo (já validado não-nulo acima)
    return proximo;
  }

  const ocorrencias: Date[] = [];
  let guarda = 0;
  // Guarda de 3000 passos: com o pulo acima, isso cobre mais de 8 anos de
  // recorrência diária dentro do próprio mês pedido, bem mais do que
  // qualquer evento real precisaria — só pra nunca travar num loop infinito
  // se um dia entrar um valor de recorrência inesperado.
  while (atual <= limite && guarda < 3000) {
    if (atual >= intervaloInicio && atual < intervaloFim) ocorrencias.push(new Date(atual));
    atual = avancar(atual);
    guarda++;
  }

  return ocorrencias;
}

// Próxima ocorrência a partir de agora (inclusive hoje) — usada em telas de
// resumo (ex.: mural público, portal) pra mostrar "próxima vez que esse
// evento recorrente acontece" em vez da primeira data lá no passado.
export function proximaOcorrencia(
  dataInicio: Date,
  recorrencia: string,
  recorrenciaAte: Date | null,
  aPartirDe: Date
): Date | null {
  if (recorrencia === "Nenhuma" || !recorrenciaAte) {
    return dataInicio >= aPartirDe ? dataInicio : null;
  }
  // Janela generosa (5 anos) só pra achar a primeira ocorrência >= aPartirDe.
  const fimBusca = new Date(aPartirDe.getFullYear() + 5, aPartirDe.getMonth(), aPartirDe.getDate());
  const ocorrencias = ocorrenciasNoIntervalo(dataInicio, recorrencia, recorrenciaAte, aPartirDe, fimBusca);
  return ocorrencias[0] ?? null;
}
