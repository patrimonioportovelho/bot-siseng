# SisEng — Banco de dados

Schema PostgreSQL do SisEng, o sistema de gestão da imobiliária (venda, locação,
administração, correspondência bancária e financeiro), substituindo a planilha
AppSheet. Detalhes de cada tabela, regra de negócio e diagrama de relacionamento
estão na *Especificação Técnica* (documento Word entregue separadamente).

## Arquivos

| Arquivo | O que faz |
|---|---|
| `schema.sql` | Cria todas as tabelas, índices, triggers e comentários. |
| `seed.sql` | Popula tabelas de apoio (lojas, estados, bancos, categorias). Rodar depois do schema. |
| `.env.example` | Modelo de variável de ambiente `DATABASE_URL`. |

## Como subir o banco (Neon ou Supabase — grátis para começar)

1. Crie uma conta em [neon.tech](https://neon.tech) ou [supabase.com](https://supabase.com) e crie um projeto Postgres.
2. Copie a *connection string* (formato `postgresql://usuario:senha@host/banco?sslmode=require`).
3. Copie `.env.example` para `.env` e cole a connection string em `DATABASE_URL`.
4. Rode os dois arquivos, na ordem, usando `psql` ou o editor SQL do próprio provedor:

```bash
psql "$DATABASE_URL" -f schema.sql
psql "$DATABASE_URL" -f seed.sql
```

Ou, se preferir, abra `schema.sql` e depois `seed.sql` no editor SQL web do Neon/Supabase e execute o conteúdo colado.

## Migração dos dados da planilha

A planilha `Administrativo` tem cerca de 4.500 linhas em 29 abas. Pontos de atenção antes de importar (ver seção 7 da Especificação Técnica):

- **Formato de ID**: a planilha mistura um formato sequencial (`PA0001`) com hexadecimal (`9e7317ab`). Ao migrar, gere um UUID novo para cada linha e mantenha uma tabela de conversão (ID antigo → UUID novo) para poder religar as referências entre abas.
- **~8 registros órfãos conhecidos** (`Imovel.ClienteVendedor`, `Transacao.Cliente`, `Transacao.AdmImovel`, `Transacao.Imovel`, `CondicoesPg.Transacao`, `Andamento.Imovel` apontando para registros que não existem mais). Por decisão do cliente, nada foi descartado. As colunas correspondentes no schema (`imoveis.cliente_vendedor_id`, `transacoes.adm_imovel_id`, `transacoes.imovel_id`, `andamentos.imovel_id`) foram deixadas `NULLABLE` de propósito para não travar a importação desses casos — revisar depois com calma.
- Depois da carga inicial, considere rodar `ANALYZE;` para o Postgres atualizar as estatísticas do otimizador de consultas.

## Sobre os "enums"

Campos como `funcao`, `tipo_imovel`, `status_imovel` foram implementados como `TEXT` + `CHECK` (nos poucos casos que já têm uma lista fechada e estável), em vez de `ENUM` nativo do Postgres — assim, adicionar uma opção nova é só um `ALTER TABLE ... DROP CONSTRAINT / ADD CONSTRAINT`, sem precisar de migração de tipo. Onde a lista ainda pode crescer bastante (`status_imovel`, `status` de contrato etc.), deixei como `TEXT` livre, para não travar o cadastro.

Os valores de cada `CHECK` foram conferidos direto no editor do AppSheet (não só na planilha), então refletem exatamente as listas configuradas hoje — inclusive correções em relação à primeira versão do schema: `movimentacoes.tipo`/`categorias_financeiras.tipo` são `Despesa`/`Recebimento` (não `Pagamento`), `imoveis.tipo_oferta` é o estágio do funil (`Rascunho`/`Em análise`/`Administração`/`Em negociação`/`Inativo`/`Arquivado`, não `Venda`/`Locação`/`Administração`), e `adm_imoveis.agua`/`energia` viraram `TEXT` (origem/situação da ligação) em vez de `BOOLEAN`. Campos como `transacoes.status` e `encerramentos_transacao.status_final` ficaram sem `CHECK` de propósito: no AppSheet são referências a uma tabela de domínio (`Status`) com lista aberta, não um Enum fixo.

## Módulo de Metas (novo, não existia no AppSheet)

`metas` guarda metas individuais (por corretor) ou coletivas (por loja) de vendas, locações, honorários, captação de imóveis, avaliações aprovadas ou novos clientes, por período (mensal/trimestral/semestral/anual). O valor realizado nunca é gravado à mão: a view `vw_metas_progresso` calcula ao vivo a partir de `transacoes`/`pagamentos`/`imoveis`/`avaliacoes`/`clientes`, e `vw_ranking_mes_atual` monta o leaderboard do mês corrente. Ver a página `/metas` no `app-web` para o primeiro recorte de UI (barras de progresso + ranking).

## Regras de negócio que ficam por conta da aplicação (não são CHECK no banco)

Para não travar a migração de dados históricos imperfeitos, as regras abaixo devem ser validadas na camada de aplicação (API), não como `CHECK` rígido no banco:

- `clientes.estado_civil` em `Casado`/`União Estável` deveria sempre ter `conjuge_id` preenchido.
- A soma de `condicoes_pagamento.valor` de uma transação deveria fechar com `transacoes.valor_transacao`.
- Em `transacoes`, `porc_corretor_proprietario + porc_corretor_contraparte + (porc_parceria, se tem_parceria) + porc_imobiliaria` deveria fechar 100% do honorário.
- Quando `andamentos.status_andamento` muda para `Concluído`, `avaliacoes.status` da avaliação vinculada deve ser atualizado para `Concluído` automaticamente.

## Próximo passo (quando escolher o framework web)

Se for usar Next.js na Vercel, o caminho mais rápido é apontar o Prisma para este
banco já criado, em vez de escrever o schema do zero:

```bash
npx prisma init
npx prisma db pull        # gera prisma/schema.prisma a partir do banco existente
npx prisma generate
```

Isso evita manter duas fontes de verdade (SQL e schema do ORM) divergentes.
