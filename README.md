# SisEng

Monorepo do sistema de gestão da imobiliária. Duas partes independentes, cada
uma com seu próprio deploy:

```
bot-siseng/
├── bot/            Bot de Telegram em Python (hoje lê o Google Sheets;
│                   depois passa a consultar a API do site). Deploy: Railway.
├── site/           O sistema novo (SisEng propriamente dito). Deploy: Vercel.
│   └── database/   Schema SQL do banco (Postgres) e dados de apoio.
└── README.md       Este arquivo.
```

## Por que separado assim

O bot faz *long polling* no Telegram e roda dois laços contínuos (monitor da
planilha a cada 5 minutos, notícias 3x por dia) — precisa de um processo
persistente, por isso fica no Railway. O site vai ser uma aplicação web
comum (Next.js), que roda bem em serverless — por isso Vercel. Os dois
compartilham o mesmo repositório para facilitar a organização, mas cada
plataforma de deploy aponta só para a sua pasta ("Root Directory").

## Ação pendente no Railway

Depois dessa reorganização, o Root Directory do serviço no Railway precisa
ser atualizado de vazio (raiz do repo) para `bot`, senão o build não vai
encontrar `requirements.txt` nem `bot.py`. Isso se ajusta na aba
**Settings → Build → Root Directory** do serviço, direto no painel do Railway.

## Onde encontrar cada coisa

- Documentação de negócio completa (entidades, regras, fluxos): documento
  *Especificação Técnica* entregue separadamente.
- Schema do banco: `site/database/schema.sql` e `site/database/seed.sql`.
- Bot: `bot/LEIA_ME.txt`.
- Site: em construção — ver `site/app-web` assim que o scaffold entrar.
