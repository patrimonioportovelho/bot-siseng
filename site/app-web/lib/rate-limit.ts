// Rate limiting simples em memória, por chave (email normalizado) — bloqueia
// tentativa de login depois de várias erradas seguidas. Achado "Alto" da
// auditoria de 01/08/2026: não existia nenhum limite, dava pra tentar senha
// infinitas vezes sem trava nenhuma.
//
// Limitação HONESTA: em memória, por instância — numa função serverless
// (Vercel) isso protege bem contra ataque repetido batendo na mesma
// instância "quente", mas não é garantido entre instâncias diferentes/frias.
// Pra proteção 100% robusta entre todas as instâncias, o certo é uma tabela
// no banco ou um serviço tipo Upstash Redis — ficou como melhoria futura
// (não implementado agora pra não precisar de mais uma migração no Supabase
// nesta rodada). Mesmo parcial, já é bem melhor que não ter nada.
const JANELA_MS = 5 * 60 * 1000; // 5 minutos
const MAX_TENTATIVAS = 5;
const BLOQUEIO_MS = 5 * 60 * 1000; // 5 minutos de bloqueio após estourar o limite

type Registro = { tentativas: number; primeiraTentativaEm: number; bloqueadoAte: number | null };

const registros = new Map<string, Registro>();

// Limpeza oportunista pra não crescer sem limite em memória — roda a cada
// chamada, é barato (só olha o Map já em memória).
function limparExpirados(agora: number) {
  for (const [chave, registro] of registros) {
    const expirouJanela = agora - registro.primeiraTentativaEm > JANELA_MS;
    const expirouBloqueio = !registro.bloqueadoAte || agora > registro.bloqueadoAte;
    if (expirouJanela && expirouBloqueio) registros.delete(chave);
  }
}

export function checarBloqueioLogin(chave: string): { bloqueado: true; minutosRestantes: number } | { bloqueado: false } {
  const agora = Date.now();
  limparExpirados(agora);
  const registro = registros.get(chave.toLowerCase().trim());
  if (registro?.bloqueadoAte && agora < registro.bloqueadoAte) {
    return { bloqueado: true, minutosRestantes: Math.ceil((registro.bloqueadoAte - agora) / 60_000) };
  }
  return { bloqueado: false };
}

// Chamar depois de uma tentativa de login SEM sucesso. Se estourar o limite,
// já marca o bloqueio.
export function registrarTentativaFalha(chave: string): void {
  const agora = Date.now();
  const chaveNorm = chave.toLowerCase().trim();
  const registro = registros.get(chaveNorm);

  if (!registro || agora - registro.primeiraTentativaEm > JANELA_MS) {
    registros.set(chaveNorm, { tentativas: 1, primeiraTentativaEm: agora, bloqueadoAte: null });
    return;
  }

  registro.tentativas += 1;
  if (registro.tentativas >= MAX_TENTATIVAS) {
    registro.bloqueadoAte = agora + BLOQUEIO_MS;
  }
}

// Chamar depois de um login BEM-SUCEDIDO — limpa qualquer histórico de
// tentativa errada daquela chave.
export function limparTentativas(chave: string): void {
  registros.delete(chave.toLowerCase().trim());
}
