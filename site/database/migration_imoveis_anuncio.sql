-- Anuncio do imovel no site — 16/11/2026.
--
-- Quando o card da gestao/captacao vai para "Comercializacao", o administrativo confirma se o imovel ja foi
-- anunciado no site. Se foi, informa o ID do anuncio (padrao 721551039-63) e o link (obrigatorio junto com o ID).
-- Fica no cadastro do imovel (ao lado de "Pasta (link)").
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS anuncio_id TEXT;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS anuncio_url TEXT;
