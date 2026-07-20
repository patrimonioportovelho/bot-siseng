# Motor de documentos — templates

Pasta separada da pasta `site/` (o código do sistema) e da `bot/` — aqui
ficam só os documentos de verdade, para quem trabalha no escritório mexer
sem precisar abrir o projeto do site.

Já existem os 9 arquivos abaixo, gerados como esqueleto (timbrado
provisório + texto de exemplo). Substitua o conteúdo de cada um pelo
contrato/recibo oficial da imobiliária, mantendo os placeholders
`{{entre_chaves_duplas}}` exatamente onde estão hoje — são eles que o
sistema troca pelos dados reais.

| Arquivo | Gerado a partir de |
|---|---|
| `contrato_locacao.docx` | Transação (Locação) |
| `contrato_compra_venda.docx` | Transação (Compra e Venda) |
| `carta_preferencia.docx` | Transação |
| `contrato_administracao.docx` | AdmImóvel |
| `contrato_associacao_corretor.docx` | Parceiro (função Corretor) |
| `contrato_associacao_corretor_estagiario.docx` | Parceiro (função Corretor Estagiário) |
| `termo_entrega_chaves.docx` | Chaves |
| `recibo_honorarios.docx` | Movimentação |
| `repasse_administracao.docx` | Movimentação |
| `repasse_primeira_locacao.docx` | Movimentação |
| `contrato_gestao.docx` | Gestão |
| `PROPOSTA DE COMPRA E VENDA.docx` | Proposta (portal do corretor) |

O sistema escolhe automaticamente entre os dois contratos de corretor
conforme a função do parceiro (Corretor ou Corretor Estagiário). Os dois já
estão preenchidos com o texto oficial e usam os placeholders
`{{Parceiro}}`, `{{EstadoCivil}}`, `{{DataNascimento}}`, `{{CPF}}`,
`{{Creci}}` (só no contrato de Corretor), `{{Email}}`, `{{Telefone}}`,
`{{Endereco}}`, `{{Fee}}`, `{{PorcCompr}}`, `{{PorcVend}}`, `{{DiaFee}}`,
`{{Cidade}}`, `{{Estado}}` e `{{DataEntrada}}` — lembre de enviar os dois
também ao bucket `templates` do Supabase Storage quando forem atualizados.

## Como editar

Abra qualquer um no Word, Google Docs ou LibreOffice normalmente. Pode
trocar fonte, logotipo, margens, cabeçalho/rodapé, tudo — a única regra é
não alterar o texto dentro de `{{ }}`. Cada arquivo já tem, no final, a
lista dos campos disponíveis para aquele modelo (a mesma lista que está em
`site/app-web/lib/documentos/campos.ts`, a fonte oficial caso os dois
fiquem diferentes um dia).

Precisa de um campo nesse arquivo com o valor por extenso (ex.: valor do
aluguel, data de assinatura)? Use `_extenso` no final do nome, como
`{{valor_transacao_extenso}}` — isso já vem pronto, formatado conforme a
exigência legal brasileira.

## Como esses arquivos chegam ao sistema

Em desenvolvimento local, o site lê direto desta pasta (variável
`TEMPLATES_LOCAL_DIR` no `.env` do `app-web`, já configurada por padrão
para apontar aqui).

Em produção (Vercel), o site não tem acesso a esta pasta — ela fica fora do
diretório `site/app-web` que é implantado. Por isso, sempre que um arquivo
aqui for atualizado, ele precisa ser enviado também para o bucket
`templates` do Supabase Storage (mesmo nome de arquivo). Isso pode ser feito
manualmente pelo painel do Supabase (Storage → templates → upload) ou por
um script simples de sincronização — se quiser, posso montar esse script
depois que o Supabase estiver configurado.

**Ao adicionar um modelo novo** (como aconteceu com `contrato_gestao` e
`proposta_compra_venda`, que ficaram faltando um tempo): além de subir o
.docx no bucket `templates`, o valor precisa entrar nos dois CHECK
constraints da tabela `documentos_gerados` no banco
(`entidade_tipo` e `tipo_documento` — ver `site/database/schema.sql`),
senão a geração quebra tanto no sucesso quanto ao tentar logar o próprio
erro.
