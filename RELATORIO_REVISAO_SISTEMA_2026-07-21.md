# Revisão geral do SisEng — 21/07/2026

Revisão completa do sistema (admin + portal do corretor): código de todos os módulos (Clientes, Imóveis, Financiamento, Financeiro, Transações de Locação e Compra e Venda, Administrações, Gestões, Manutenção, Metas, Parceiros, Configurações e os 6 fluxos do portal) e auditoria dos dados reais em produção no Supabase. Nada aqui foi corrigido ainda, exceto o que já foi entregue nesta semana (listado no fim) — a ideia é você aprovar as prioridades antes de eu mexer.

---

## 1. Crítico — a raiz do "toda vez perdemos cadastro"

**O problema estrutural é um só, e explica os episódios repetidos de perda de cadastro.** No admin, quase toda validação de formulário é feita com `throw new Error(...)` dentro da Server Action. Quando isso dispara, o Next derruba a página inteira pra tela "Não deu pra salvar", e o botão "Tentar de novo" re-renderiza a página do zero — tudo que estava digitado some. O portal do corretor não sofre disso porque lá as actions retornam o erro como resposta (`{ ok: false, erro }`) e o formulário mostra a mensagem inline, sem destruir nada.

Quantidade de pontos de validação que hoje derrubam a página no admin, por módulo: Transações 19, Financeiro 17, Financiamento 14, Manutenção 10, Gestões 9, Metas 7, Administrações 5, Clientes 5, Parceiros 5, Imóveis 4.

**Recomendação (P1):** migrar os formulários do admin pro mesmo padrão do portal (erro inline, dados preservados), começando pelos módulos onde mais se digita: Transações, Clientes e Financeiro. Enquanto isso não é feito, todo erro de validação ou de banco no admin continua custando o cadastro digitado.

## 2. Alto — erros de banco que não deixam rastro

O sistema tem o `logs_erro` (Configurações > Erros de cadastro), mas só grava quando a mutação está embrulhada no `registrarEJogarErro`. Módulos com mutações descobertas (erro de banco ali some sem registro): **Configurações (7 mutações, nenhuma coberta)**, **Gestões (9 mutações, só 2 cobertas)**, **Manutenção (9/3)**, **Transações (7/4)**, portal/actions e login. Foi exatamente essa lacuna que atrasou o diagnóstico do bug do "Análise de crédito" na semana passada.

**Recomendação (P2):** completar a cobertura do `registrarEJogarErro` nesses módulos. Mudança mecânica e de baixo risco.

## 3. Alto — duplicidade de cliente não é checada no admin

O portal checa duplicidade (mesmo nome ou CPF/CNPJ) antes de criar cliente; o cadastro de Clientes do admin **não checa nada** — cria direto. O resultado já aparece nos dados: **19 CPFs com cadastro duplicado e 27 nomes duplicados** em produção. Cliente duplicado divide o histórico (transações numa ficha, avaliação na outra) e estraga qualquer indicador por cliente.

**Recomendação (P2):** aplicar a mesma checagem `buscarClienteDuplicado` no admin (com opção de "criar mesmo assim", já que o admin tem autoridade pra decidir) + uma rodada de fusão dos duplicados existentes (posso montar a lista pra você validar caso a caso — fusão automática é arriscada).

## 4. Dados em produção — o que a auditoria encontrou (21/07)

**Financeiro / inadimplência:** 209 movimentações vencidas e não pagas, somando **R$ 83.882,28**. Hoje isso não aparece consolidado em lugar nenhum — é o indicador mais urgente que falta.

**Locação:** das locações com status "Imóvel em Locação", **85 não têm nenhuma movimentação futura em aberto** — ou seja, não existe a cobrança do próximo aluguel lançada no Financeiro. Se a régua é "gerar movimentação a cada mês", essas 85 estão fora da régua e a inadimplência real pode ser maior do que os R$ 83 mil registrados.

**Compra e Venda:** 4 transações ativas em que a soma das condições de pagamento não fecha com o valor da transação (3 delas sem nenhuma condição lançada). O schema até documenta essa regra ("a soma deve fechar com valor_transacao — validar na aplicação"), mas a aplicação não valida nem avisa.

**Comissionamento:** **33 transações ativas** em que corretor(es) + imobiliária + parceria não fecham 100% do honorário. Também é regra documentada no schema e não validada — sobra ou falta comissão implícita.

**Cadastro de clientes (base pros indicadores):** 227 Pessoas Físicas sem CPF e 610 sem telefone. Pra análise de crédito e cobrança, são cadastros cegos.

**O que está limpo:** nenhum imóvel ativo sem proprietário (o caso que travou o cadastro de ontem já não existe mais na base), nenhuma transação sem contraparte, nenhuma avaliação Aprovada vencida sem atualização, e a varredura completa dos 58 CHECK constraints × listas de opções do app (feita na semana passada) não tem mais nenhuma divergência.

## 5. Indicadores — proposta pro Dashboard atual

O Dashboard hoje já tem: evolução do período (CV + Locação + Administração), perfil de clientes/imóveis, tabela de corretores com quantidades e a seção de Financiamento com filtro de datas. O que falta pra fechar o acompanhamento que você pediu:

**a) Funil comercial (Financiamento → venda):** Consulta de CPF → Avaliação → Aprovado → Andamento → Concluído, com taxa de conversão entre etapas e tempo médio em cada uma. Os dados já existem (avaliacoes.status + andamentos); é só consolidar.

**b) Inadimplência (Financeiro):** total vencido não pago (R$ e quantidade), com aging (até 30d / 30–90d / +90d) e os maiores devedores. Card vermelho no topo do Dashboard + lista clicável.

**c) Saúde da carteira de Locação:** locações ativas × quantas estão com a próxima cobrança lançada (as 85 de cima viram um alerta operacional: "locações sem cobrança gerada").

**d) Consistência de contratos:** contadores de "condições não fecham o valor" e "comissão não fecha 100%" — além de aparecer no Dashboard, o formulário da transação passa a avisar na hora de salvar (sem bloquear, só alertar).

**e) Qualidade de cadastro:** % de clientes PF com CPF e telefone preenchidos, e contagem de duplicados — pra acompanhar a limpeza da base ao longo do tempo.

**f) Vencimentos:** já existe pra avaliação (30 dias); estender o mesmo conceito pra prazo de gestão e vigência de contrato de administração/locação num bloco único de "vencendo nos próximos 30/60 dias".

## 6. Ordem de execução sugerida

1. **P1 — Parar de perder cadastro no admin** (erro inline nos formulários; começar por Transações, Clientes, Financeiro).
2. **P2 — Cobertura completa do logs_erro + checagem de duplicidade no admin.**
3. **P3 — Indicadores no Dashboard** na ordem: inadimplência (b), locações sem cobrança (c), funil (a), consistência de contratos (d), qualidade/vencimentos (e, f).
4. **P4 — Limpeza de dados assistida:** fusão dos clientes duplicados e completar as condições de pagamento/comissões das 33+4 transações apontadas (posso gerar as listas nominais pra sua equipe resolver).

---

*Já corrigido nesta semana (sessões anteriores + hoje): constraint do "Análise de crédito" (perda de cadastro na Avaliação), vendedor editável na Elaboração de Compra e Venda do portal (perda de cadastro quando o imóvel não tinha proprietário), Profissão na Proposta (formulário + texto fixo indevido no template), padronização automática de capitalização do nome de clientes (225 corrigidos + correção automática em todo salvamento), Recorrência na transação, co-titulares/cônjuge na Avaliação, botão Excluir no detalhe do Financiamento e ordem alfabética na listagem.*
