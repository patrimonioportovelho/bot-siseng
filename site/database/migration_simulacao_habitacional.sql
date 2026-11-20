-- Simulação habitacional de imóveis usados (Caixa) — 20/11/2026.
--
-- Aparece na etiqueta do Financiamento quando o cliente está em "Montagem de processo". Dois pedaços:
--   1) simulacao_parametros: taxas, tetos, LTV, seguros etc. FICAM NO BANCO (não no código), porque mudam por
--      portaria/resolução/política da Caixa. Valor NULL = "não configurado": a simulação avisa em vez de inventar.
--   2) simulacoes_habitacionais: cada simulação gerada (entradas + resultado), para histórico da avaliação.
-- RLS ligado e sem política: o acesso é só pelo servidor (Prisma), nunca pela chave pública do Supabase.

CREATE TABLE IF NOT EXISTS simulacao_parametros (
  chave       TEXT PRIMARY KEY,
  valor       JSONB,
  grupo       TEXT NOT NULL,
  descricao   TEXT NOT NULL,
  fonte       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID
);

CREATE TABLE IF NOT EXISTS simulacoes_habitacionais (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avaliacao_id UUID NOT NULL REFERENCES avaliacoes(id) ON DELETE CASCADE,
  entrada      JSONB NOT NULL,
  resultado    JSONB NOT NULL,
  status       TEXT NOT NULL,
  criado_por   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS simulacoes_habitacionais_avaliacao_idx ON simulacoes_habitacionais (avaliacao_id, created_at DESC);

ALTER TABLE simulacao_parametros ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulacoes_habitacionais ENABLE ROW LEVEL SECURITY;

-- Valores iniciais. "Simulação Caixa 18/09/2026" = calibrado/confirmado contra uma simulação real da Caixa (MCMV,
-- imóvel usado, Porto Velho, faixa 3). "Referência (confirmar)" = veio do prompt de referência e precisa ser conferido
-- no simulador oficial. NULL = ainda não informado.
INSERT INTO simulacao_parametros (chave, valor, grupo, descricao, fonte) VALUES
  ('comprometimento_max_renda', '0.30', 'Gerais', 'Parte máxima da renda bruta comprometida com a 1ª prestação (30% = 0,30).', 'Referência (confirmar)'),
  ('prazo_max_meses', '420', 'Gerais', 'Prazo máximo do financiamento, em meses.', 'Referência (confirmar)'),
  ('idade_max_final_contrato_meses', '966', 'Gerais', 'Idade máxima do proponente mais velho ao fim do contrato, em meses (966 = 80 anos e 6 meses).', 'Referência (confirmar)'),
  ('idade_min_anos', '18', 'Gerais', 'Idade mínima do proponente mais velho, em anos.', 'Referência'),
  ('teto_sfh', '2250000', 'Gerais', 'Teto de valor do imóvel no SFH (acima disso é SFI, sem FGTS).', 'Referência (out/2025)'),
  ('sbpe_ltv_sac', '0.80', 'SBPE', 'Cota máxima de financiamento no SBPE, tabela SAC.', 'Referência (vigente desde 13/10/2025)'),
  ('sbpe_ltv_price', '0.70', 'SBPE', 'Cota máxima de financiamento no SBPE, tabela Price.', 'Referência (confirmar)'),
  ('sbpe_taxa_nominal_aa_com_relacionamento', '0.1119', 'SBPE', 'Juros nominais ao ano no SBPE para cliente com relacionamento (mais TR).', 'Referência (confirmar)'),
  ('sbpe_taxa_nominal_aa_sem_relacionamento', NULL, 'SBPE', 'Juros nominais ao ano no SBPE para cliente sem relacionamento (mais TR). Maior que a taxa com relacionamento.', NULL),
  ('mcmv_faixas',
   '[{"faixa":1,"renda_min":0,"renda_max":3200,"taxa_cot_nne_min":0.04,"taxa_cot_nne_max":0.045,"taxa_cot_demais_min":0.0425,"taxa_cot_demais_max":0.045,"taxa_nao_cot_min":0.045,"taxa_nao_cot_max":0.05,"subsidio_usado":0},
     {"faixa":2,"renda_min":3200.01,"renda_max":5000,"taxa_cot_nne_min":0.0475,"taxa_cot_nne_max":0.06,"taxa_cot_demais_min":0.05,"taxa_cot_demais_max":0.06,"taxa_nao_cot_min":0.0525,"taxa_nao_cot_max":0.07,"subsidio_usado":0},
     {"faixa":3,"renda_min":5000.01,"renda_max":9600,"taxa_cot_nne_min":0.0766,"taxa_cot_nne_max":0.0766,"taxa_cot_demais_min":0.0766,"taxa_cot_demais_max":0.0766,"taxa_nao_cot_min":0.0816,"taxa_nao_cot_max":0.0816,"subsidio_usado":0},
     {"faixa":4,"renda_min":9600.01,"renda_max":13000,"taxa_cot_nne_min":0.10,"taxa_cot_nne_max":0.10,"taxa_cot_demais_min":0.10,"taxa_cot_demais_max":0.10,"taxa_nao_cot_min":0.105,"taxa_nao_cot_max":0.105,"subsidio_usado":0}]',
   'MCMV', 'Faixas de renda do MCMV (urbano) e juros nominais ao ano por região/cotista. As faixas de renda seguem a Portaria MCID 333/2026 (faixa 4 até R$ 13 mil). Nas faixas 1 e 2 a taxa varia entre mínimo e máximo conforme a renda (interpolação linear). Juros: faixa 3 conferida na simulação Caixa de 18/09/2026; as demais taxas são referência.', 'Renda: Portaria MCID 333/2026; juros faixa 3: Simulação Caixa 18/09/2026; demais juros: confirmar'),
  ('mcmv_ltv_usado',
   '[{"faixa":1,"ltv":null},{"faixa":2,"ltv":null},{"faixa":3,"ltv":0.80},{"faixa":4,"ltv":null}]',
   'MCMV', 'Cota máxima de financiamento do MCMV para imóvel usado, por faixa. Só a faixa 3 foi confirmada (80%); as outras precisam ser conferidas no simulador da Caixa.', 'Faixa 3: Simulação Caixa 18/09/2026'),
  ('mcmv_tetos',
   '[{"municipio":"PORTO VELHO","uf":"RO","teto_faixa_1_2":255000,"teto_faixa_3":400000,"teto_faixa_4":600000}]',
   'MCMV', 'Valor máximo do imóvel por município e faixa. Faixa 3 (R$ 400 mil) e faixa 4 (R$ 600 mil) conforme a Portaria MCID 333/2026, que não traz variação por município. O teto das faixas 1 e 2 (R$ 255 mil) NÃO foi confirmado para Porto Velho: confira na Caixa.', 'Faixas 3 e 4: Portaria MCID 333/2026 (gov.br); faixas 1 e 2: confirmar'),
  ('seguro_mip_faixas_idade',
   '[{"idade_ate":50,"taxa_mensal":0.00035808},{"idade_ate":55,"taxa_mensal":0.00064301},{"idade_ate":60,"taxa_mensal":0.0007611},{"idade_ate":65,"taxa_mensal":0.00128962},{"idade_ate":70,"taxa_mensal":0.00199092},{"idade_ate":71,"taxa_mensal":0.0036946},{"idade_ate":72,"taxa_mensal":0.0036903},{"idade_ate":73,"taxa_mensal":0.0036848},{"idade_ate":74,"taxa_mensal":0.00367745},{"idade_ate":75,"taxa_mensal":0.00366715},{"idade_ate":76,"taxa_mensal":0.00447135},{"idade_ate":77,"taxa_mensal":0.00443979},{"idade_ate":78,"taxa_mensal":0.00437579},{"idade_ate":79,"taxa_mensal":0.00416834},{"idade_ate":80,"taxa_mensal":0.00324173},{"idade_ate":120,"taxa_mensal":0.00324173}]',
   'Encargos', 'Seguro MIP (morte e invalidez): taxa mensal sobre o saldo devedor, por faixa de idade (idade até X anos). Calibrado na planilha de uma simulação MCMV de proponente de 47 anos (idades de 47 a 80); abaixo de 47 anos a taxa não foi conferida.', 'Simulação Caixa 18/09/2026 (calibrado)'),
  ('seguro_dfi_taxa_mensal', '0.000071', 'Encargos', 'Seguro DFI (danos físicos ao imóvel): taxa mensal sobre o valor do imóvel.', 'Simulação Caixa 18/09/2026 (calibrado)'),
  ('taxa_administracao_mensal', '25', 'Encargos', 'Taxa de administração mensal, em reais.', 'Simulação Caixa 18/09/2026'),
  ('tarifa_avaliacao_pct', '0.015', 'Encargos', 'Tarifa de avaliação do imóvel em garantia, como parte do valor financiado (entra no CET).', 'Simulação Caixa 18/09/2026'),
  ('seguro_a_vista', '100.30', 'Encargos', 'Seguro pago à vista na contratação, em reais (entra no CET).', 'Simulação Caixa 18/09/2026 (calibrado)'),
  ('ultima_prestacao_sem_seguros', 'true', 'Encargos', 'Na última prestação a Caixa não cobra MIP e DFI (conforme a planilha da simulação).', 'Simulação Caixa 18/09/2026'),
  ('itbi_aliquotas', '[]', 'Custos', 'Alíquota do ITBI por município (ex.: 0.02 = 2%). Sem alíquota o sistema não estima o ITBI.', NULL)
ON CONFLICT (chave) DO NOTHING;
