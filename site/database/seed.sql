-- ============================================================
-- SisEng — Dados de apoio (seed)
-- Rode depois de schema.sql
-- ============================================================

-- Lojas (escritórios)
INSERT INTO lojas (nome, cidade, estado) VALUES
  ('Porto Velho', 'Porto Velho', 'Rondônia'),
  ('Jaru', 'Jaru', 'Rondônia');

-- Estados (Brasil, 27 unidades federativas)
INSERT INTO estados (nome) VALUES
  ('Acre'),('Alagoas'),('Amapá'),('Amazonas'),('Bahia'),('Ceará'),
  ('Distrito Federal'),('Espírito Santo'),('Goiás'),('Maranhão'),
  ('Mato Grosso'),('Mato Grosso do Sul'),('Minas Gerais'),('Pará'),
  ('Paraíba'),('Paraná'),('Pernambuco'),('Piauí'),('Rio de Janeiro'),
  ('Rio Grande do Norte'),('Rio Grande do Sul'),('Rondônia'),('Roraima'),
  ('Santa Catarina'),('São Paulo'),('Sergipe'),('Tocantins');

-- Cidades de partida (Rondônia — onde a operação atua hoje)
INSERT INTO cidades (nome, estado_id, regiao)
SELECT 'Porto Velho', id, 'Norte' FROM estados WHERE nome = 'Rondônia'
UNION ALL
SELECT 'Jaru', id, 'Norte' FROM estados WHERE nome = 'Rondônia'
UNION ALL
SELECT 'Ariquemes', id, 'Norte' FROM estados WHERE nome = 'Rondônia'
UNION ALL
SELECT 'Ji-Paraná', id, 'Norte' FROM estados WHERE nome = 'Rondônia';

-- Bancos mais comuns (código Febraban)
INSERT INTO bancos (nome, codigo) VALUES
  ('Banco do Brasil', '001'),
  ('Caixa Econômica Federal', '104'),
  ('Bradesco', '237'),
  ('Itaú Unibanco', '341'),
  ('Santander', '033'),
  ('Banco Cooperativo Sicredi', '748'),
  ('Banco Inter', '077'),
  ('Nu Pagamentos (Nubank)', '260'),
  ('Banco BTG Pactual', '208'),
  ('Banco Original', '212');

-- Categorias financeiras de partida (ajustar conforme plano de contas real)
INSERT INTO categorias_financeiras (nome, tipo) VALUES
  ('Honorário de venda', 'Recebimento'),
  ('Honorário de locação', 'Recebimento'),
  ('Taxa de administração', 'Recebimento'),
  ('Remuneração de correspondência bancária', 'Recebimento'),
  ('Comissão de corretor', 'Pagamento'),
  ('Repasse a proprietário', 'Pagamento'),
  ('Despesa administrativa', 'Pagamento'),
  ('Fee de corretor (mensalidade)', 'Recebimento');
