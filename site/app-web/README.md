# SisEng — app-web

Next.js (App Router) + TypeScript + Tailwind + Prisma. Esqueleto inicial:
menu lateral com os módulos do sistema, dashboard com dados de exemplo, e
páginas de placeholder para os demais módulos (serão preenchidos conforme
a ordem de implementação combinada — locação primeiro, depois financeiro,
venda, financiamento, motor de documentos).

## Rodando localmente

Precisa de Node.js 20+ instalado.

```bash
npm install
cp .env.example .env      # cole a DATABASE_URL do Supabase/Neon
npx prisma db pull        # importa o schema real (site/database/schema.sql)
npx prisma generate
npm run dev
```

Abre em `http://localhost:3000` — redireciona direto pro `/dashboard`.

## Estrutura

```
app/              Páginas (App Router). Uma pasta por rota.
components/       Componentes de UI compartilhados (Sidebar, Topbar, cards).
lib/nav.ts         Lista dos itens do menu lateral.
lib/prisma.ts       Cliente Prisma (singleton, evita reconectar a cada hot-reload).
prisma/schema.prisma  Gerado via `prisma db pull` a partir do banco real.
```

## Cores

As cores vivem em `app/globals.css` como variáveis CSS (`--pri`, `--acc`,
`--bg`) — mesmo esquema testado no mockup interativo. Pra trocar a paleta
depois de fechada, só editar esse arquivo.

## Deploy na Vercel

Ao importar o repositório na Vercel, configurar em **Settings → General →
Root Directory**: `site/app-web`. Adicionar `DATABASE_URL` nas
Environment Variables do projeto (mesma connection string do `.env` local).

## Motor de documentos

`lib/documentos/` + `app/api/documentos/gerar/` geram contratos, recibos e
termos a partir de modelos `.docx` (mantendo o timbrado original). Os 9
arquivos `.docx` ficam fora desta pasta, em `bot-siseng/templates/` — ver
o README lá para como editá-los, e `lib/documentos/campos.ts` para a lista
de placeholders de cada um. Falta apenas implementar `montarDadosDoMerge`
em `lib/documentos/gerar.ts` (hoje lança erro de "não implementado") assim
que o `prisma db pull` gerar os models reais.

## Próximos passos (por módulo)

Ver o documento *Especificação Técnica* e o plano de implementação por
fases já combinado: fundação (auth + permissões) → locação → financeiro →
venda → financiamento → motor de documentos → bot.
