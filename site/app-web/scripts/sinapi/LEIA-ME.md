# Catálogo SINAPI (orçamento da Manutenção)

Atualização mensal do catálogo `catalogo_obra` (Rondônia, sem desoneração):

1. Baixe o ZIP `SINAPI-AAAA-MM-formato-xlsx.zip` em
   https://www.caixa.gov.br/site/Paginas/downloads.aspx#categoria_888 e extraia
   `SINAPI_Referência_AAAA_MM.xlsx` (planilhas ISD = insumos, CSD = composições).
2. Ajuste `REFERENCIA` (e `UF`) no topo de `extrair.py` e rode:
   `python -P scripts/sinapi/extrair.py <planilha.xlsx> <saida.json>`
   (precisa de `openpyxl`). Materiais são categorizados por palavra-chave na
   descrição; serviços pelo grupo da composição; mão de obra pela profissão
   (hora e diária = 8 h).
3. Dentro de `site/app-web`: `node scripts/sinapi/importar.cjs <saida.json>`
   (faz upsert por fonte + grupo + código + UF; itens já usados em orçamentos
   continuam ligados e o preço de referência é atualizado).
