# Os modelos .docx moram em outro lugar

Para o pessoal do escritório mexer nos contratos/recibos sem precisar abrir
o código do site, os 9 arquivos `.docx` ficam em `templates/` na raiz do
projeto (`bot-siseng/templates/`), não aqui dentro de `app-web/`.

Ver `bot-siseng/templates/README.md` para a lista de arquivos e instruções
de edição.

Esta pasta (`site/app-web/templates/`) fica vazia de propósito — é só o
lugar de onde `lib/documentos/gerar.ts` lê os arquivos em desenvolvimento
local, apontado pela variável `TEMPLATES_LOCAL_DIR` no `.env`.
