// Tipo central do retorno das Server Actions de formulário grande do
// sistema (Gold Standard, 19/08/2026 — módulo de Clientes como referência,
// ver components/cliente-form.tsx e app/clientes/actions.ts).
//
// Histórico: até agosto/2026, todo erro de validação/banco numa Server
// Action usava `throw new Error(...)`, que derruba a página inteira pro
// error boundary do Next e apaga tudo que o usuário tinha digitado — essa
// foi a causa raiz de vários relatos de "perdi o cadastro". A partir da
// Fase P1 (16-19/08/2026), toda action de formulário grande passou a
// devolver `{ erro }` em vez de lançar: o formulário usa `useActionState` e
// mostra o erro inline, com os campos intactos (ver padrão em
// components/transacao-form.tsx, cliente-form.tsx, rateio-form.tsx,
// gerar-boletos-form.tsx).
//
// Decisão de formato (19/08/2026): mantido `{ erro: string }` — mensagem
// única, já testada em produção em Transações/Clientes/Financeiro — em vez
// de um formato mais rico tipo `{ ok, message, errors, data }` com erro por
// campo, pra não reabrir o trabalho recém-fechado sem necessidade. Se um dia
// precisar de erro por campo (ex.: destacar qual input está errado), dá pra
// estender esse tipo sem quebrar quem já usa `resultado?.erro`.
//
// Genérico com `Extra` pra módulos que precisam de um campo a mais junto do
// erro (ex.: Clientes/Parceiros usam `duplicado?: boolean` pra mostrar a
// opção "cadastrar mesmo assim" só quando o bloqueio foi checagem de
// duplicidade) — o formato-base continua igual, só ganha campos extra.
export type ResultadoFormulario<Extra extends object = object> = ({ erro: string } & Extra) | undefined;

// Helper padrão pra extrair uma mensagem de erro legível de qualquer coisa
// jogada num catch — mesma função reimplementada em cada actions.ts até
// agora (transacoes, clientes, financeiro, parceiros); centralizada aqui
// pro Gold Standard não ficar com 4 cópias idênticas.
export function mensagemDeErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}
