-- ============================================================
-- SisEng — Schema de banco de dados (PostgreSQL 14+)
-- Sistema de gestão imobiliária (venda, locação, administração,
-- correspondência bancária e financeiro).
--
-- Compatível com Neon, Supabase ou qualquer Postgres gerenciado.
-- Convenções:
--   - Todas as chaves primárias são UUID (gen_random_uuid()).
--   - Nomes de tabela e coluna em snake_case, em português.
--   - Colunas "enumeradas" (Funcao, TipoImovel, StatusImovel etc.)
--     ficam como TEXT + CHECK, em vez de ENUM do Postgres, para
--     não exigir migração de tipo toda vez que uma opção nova for
--     adicionada. Enums de verdade (papel de usuário, tipo de
--     transação) usam CHECK também, pelo mesmo motivo de simplicidade.
--   - Colunas que na planilha original tinham órfãos conhecidos
--     (ver Especificação Técnica, seção 7.2) foram deixadas como
--     NULLABLE de propósito, para não travar a migração dos dados
--     históricos. Ver README.md > "Migração de dados".
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- Função utilitária: atualiza updated_at automaticamente
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1. TABELAS DE APOIO (lookups / domínio)
-- ============================================================

CREATE TABLE lojas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT NOT NULL UNIQUE,          -- 'Porto Velho' | 'Jaru'
  cidade      TEXT,
  estado      TEXT DEFAULT 'Rondônia',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE lojas IS 'Escritórios/franquias (dimensão comercial). Administração é sempre centralizada em Porto Velho, independente da loja de origem do imóvel.';

CREATE TABLE estados (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome  TEXT NOT NULL UNIQUE
);

CREATE TABLE cidades (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT NOT NULL,
  estado_id  UUID NOT NULL REFERENCES estados(id),
  regiao     TEXT,
  UNIQUE (nome, estado_id)
);
CREATE INDEX idx_cidades_estado ON cidades(estado_id);
COMMENT ON TABLE cidades IS 'Recomenda-se popular a partir de uma base pública do IBGE, em vez de manter manualmente.';

CREATE TABLE bancos (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome    TEXT NOT NULL,
  codigo  TEXT   -- código Febraban
);

CREATE TABLE categorias_financeiras (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome  TEXT NOT NULL,
  tipo  TEXT CHECK (tipo IN ('Despesa','Recebimento'))
);
COMMENT ON TABLE categorias_financeiras IS 'Plano de contas usado em movimentacoes.categoria_id.';

-- ============================================================
-- 2. PARCEIROS E USUÁRIOS
-- ============================================================

CREATE TABLE parceiros (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_legado               TEXT UNIQUE,   -- Id* original da planilha AppSheet, mantido para rastreabilidade/migração
  nome                    TEXT NOT NULL,
  foto_url                TEXT,
  telefone                TEXT,
  email                   TEXT,
  empresa                 TEXT,
  funcao                  TEXT NOT NULL CHECK (funcao IN (
                              'Administrativo','Corretor','Corretor Estagiário','Parceiro Externa',
                              'Corretor Externo','Imobiliária Externa','Prestador de Serviço','Desligado'
                          )),
  loja_id                 UUID REFERENCES lojas(id),   -- só se aplica quando funcao IN ('Corretor','Corretor Estagiário')
  status_funcao           TEXT NOT NULL DEFAULT 'Ativo' CHECK (status_funcao IN ('Ativo','Inativo','Excluído')),
  cpf                     TEXT,
  data_nascimento         DATE,
  identidade              TEXT,
  expedicao_estado        TEXT,
  estado_civil            TEXT CHECK (estado_civil IN
                              ('solteiro (a)','em uma união estável','casado (a)','divorciado (a)','separado judicialmente (a)','viúvo (a)')),
  creci                   TEXT,
  endereco                TEXT,
  data_entrada            DATE,   -- CORRIGIDO: ~70% dos parceiros reais na planilha não têm essa data preenchida
  obs_funcao              TEXT,
  fee                     NUMERIC(12,2),
  porc_compr              NUMERIC(6,4),
  porc_vend               NUMERIC(6,4),
  dia_fee                 SMALLINT,
  banco_id                UUID REFERENCES bancos(id),
  codigo_banco            TEXT,
  agencia                 TEXT,
  conta                   TEXT,
  tipo_conta              TEXT CHECK (tipo_conta IN ('Conta corrente','Conta poupança','Conta salário')),
  tipo_pix                TEXT CHECK (tipo_pix IN ('Telefone','Chave aleatória','E-mail','CNPJ / CPF')),
  pix                     TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_parceiros_loja ON parceiros(loja_id);
CREATE INDEX idx_parceiros_nome ON parceiros(nome);
CREATE TRIGGER trg_parceiros_updated_at BEFORE UPDATE ON parceiros
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMENT ON TABLE parceiros IS 'Cadastro amplo: corretores internos, estagiários, prestadores de serviço, administrativo, corretores/imobiliárias parceiras externas. Nem todo parceiro tem login (ver usuarios).';

CREATE TABLE usuarios (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome         TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  senha_hash   TEXT NOT NULL,
  papel        TEXT NOT NULL CHECK (papel IN ('ADMINISTRATIVO','COMERCIAL')),
  loja_id      UUID REFERENCES lojas(id),
  parceiro_id  UUID REFERENCES parceiros(id),
  ativo        BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_usuarios_loja ON usuarios(loja_id);
CREATE TRIGGER trg_usuarios_updated_at BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMENT ON TABLE usuarios IS 'Contas de login do sistema (até 10). ADMINISTRATIVO enxerga todas as lojas e o financeiro consolidado; COMERCIAL fica restrito à própria loja.';

-- ============================================================
-- 3. CLIENTES E IMÓVEIS
-- ============================================================

CREATE TABLE clientes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_legado        TEXT UNIQUE,   -- Id* original da planilha AppSheet, mantido para rastreabilidade/migração
  pasta_url        TEXT,
  data_cadastro    DATE NOT NULL DEFAULT CURRENT_DATE,
  -- CORRIGIDO: ~27% dos clientes reais não têm Parceiro preenchido e ~87% não têm Loja preenchida
  -- na planilha (cadastros antigos/importados). Ficam nullable para não travar a migração histórica.
  parceiro_id      UUID REFERENCES parceiros(id),
  loja_id          UUID REFERENCES lojas(id),
  status_cadastro  TEXT CHECK (status_cadastro IN ('Rascunho','Completo','Bloqueado','Arquivado')),
  tipo_vinculo     TEXT CHECK (tipo_vinculo IN (
                       'Cliente inquilino','Cliente proprietário de locação','Cliente proprietário de compra e venda',
                       'Cliente interessado em compra e venda','Cliente correspondência caixa','Cliente regularizações',
                       'Cliente proprietário'   -- CORRIGIDO: valor real encontrado na planilha, além dos 2 subtipos já mapeados
                   )),   -- dispara criação de pasta
  tipo_cliente     TEXT NOT NULL CHECK (tipo_cliente IN ('Pessoa Física','Pessoa Jurídica')),
  nome             TEXT NOT NULL,
  sexo             TEXT CHECK (sexo IN ('Homem','Mulher')),
  cpf              TEXT,
  cnpj             TEXT,
  rg               TEXT,
  expedicao        TEXT,
  telefone         TEXT,
  email            TEXT,
  estado_civil     TEXT CHECK (estado_civil IN
                       ('Solteiro','Casado','União Estável','Divorciado','Separado Judicialmente','Viúvo')),
  conjuge_id       UUID REFERENCES clientes(id),   -- autorrelacionamento
  renda_bruta      NUMERIC(12,2),
  data_nascimento  DATE,
  cat_profissao    TEXT CHECK (cat_profissao IN (
                       'Serviço público - Cargo Comissionado (CDS)','Serviço público - Estatutário',
                       'Autônomo','Empresário','Funcionário de empresa privada'
                   )),
  tipo_servidor    TEXT,
  profissao        TEXT,
  endereco         TEXT,
  estado_id        UUID REFERENCES estados(id),
  cidade_id        UUID REFERENCES cidades(id),
  observacao       TEXT,
  banco_id         UUID REFERENCES bancos(id),
  codigo_banco     TEXT,
  agencia          TEXT,
  conta            TEXT,
  tipo_conta       TEXT CHECK (tipo_conta IN ('Conta corrente','Conta poupança','Conta salário')),
  tipo_pix         TEXT CHECK (tipo_pix IN ('Telefone','Chave aleatória','E-mail','CPF / CNPJ')),
  pix              TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_clientes_parceiro ON clientes(parceiro_id);
CREATE INDEX idx_clientes_loja ON clientes(loja_id);
CREATE INDEX idx_clientes_conjuge ON clientes(conjuge_id);
CREATE INDEX idx_clientes_nome ON clientes(nome);
CREATE TRIGGER trg_clientes_updated_at BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMENT ON COLUMN clientes.conjuge_id IS
  'Regra de negócio (validar na aplicação, não travado por CHECK para não quebrar migração de dados legados): '
  'estado_civil Casado/União Estável deveria sempre ter conjuge_id preenchido.';

CREATE TABLE imoveis (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_legado             TEXT UNIQUE,
  data_cadastro         DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo_imovel           TEXT CHECK (tipo_imovel IN ('Residencial','Comercial','Terreno','Rural','Multifamiliar','Misto')),
  parceiro_id           UUID REFERENCES parceiros(id),
  cliente_vendedor_id   UUID REFERENCES clientes(id),   -- nullable: há órfãos conhecidos na base legada
  pasta_url             TEXT,
  inscricao             TEXT,
  rua                   TEXT,
  n_predial             TEXT,
  complemento           TEXT,
  bairro                TEXT,
  estado_id             UUID REFERENCES estados(id),
  cidade_id             UUID REFERENCES cidades(id),
  endereco              TEXT,
  matricula             TEXT,
  status_imovel         TEXT CHECK (status_imovel IN ('Pendente','Parcial','Completo','Vencido','Irregular')),
  -- CORRIGIDO: no AppSheet "TipoOferta" é o estágio do funil de captação/oferta, não Venda/Locação/Administração
  tipo_oferta           TEXT CHECK (tipo_oferta IN ('Rascunho','Em análise','Administração','Em negociação','Inativo','Arquivado')),
  valor_venda           NUMERIC(14,2),
  valor_avaliacao       NUMERIC(14,2),
  validade_avaliacao    DATE,
  descricao             TEXT,
  descricao_ia          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_imoveis_parceiro ON imoveis(parceiro_id);
CREATE INDEX idx_imoveis_cliente_vendedor ON imoveis(cliente_vendedor_id);
CREATE INDEX idx_imoveis_endereco ON imoveis(endereco);
CREATE TRIGGER trg_imoveis_updated_at BEFORE UPDATE ON imoveis
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 4. FINANCIAMENTO (correspondência bancária)
-- ============================================================

CREATE TABLE avaliacoes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_legado             TEXT UNIQUE,
  tipo_avaliacao        TEXT CHECK (tipo_avaliacao IN ('Financiamento','Locação','Analise de crédito')),
  banco_id              UUID REFERENCES bancos(id),
  status                TEXT NOT NULL DEFAULT 'Montagem de processo' CHECK (status IN (
                            'Montagem de processo','Aprovado','Standbye','Condicionado','Avaliação vencida',
                            'Avaliação cancelada','Restrição','Concluído','Reprovação','Consulta de CPF'
                        )),
  data_avaliacao        DATE,
  cliente_id            UUID REFERENCES clientes(id),
  telefone              TEXT,
  cpf                   TEXT,
  parceiro_id           UUID REFERENCES parceiros(id),
  data_validade         DATE,
  tipo_imovel           TEXT CHECK (tipo_imovel IN (
                            'Imóvel Usado','Imóvel Novo','Construção em Terreno Próprio',
                            'Terreno e Construção','Aquisição de Terreno','Real Fácil'
                        )),
  produto               TEXT CHECK (produto IN (
                            'Minha Casa Minha Vida','Sistema Brasileiro de Poupança e Empréstimo',
                            'Pró-Cotista','Certificado de Depósito Interbancário'
                        )),
  tabela                TEXT CHECK (tabela IN ('SAC','PRICE')),
  indexador             TEXT CHECK (indexador IN ('TR','Poupança','CDI')),
  valor_aprovado        NUMERIC(14,2),
  valor_financiamento   NUMERIC(14,2),
  prestacao             NUMERIC(14,2),
  usa_fgts              BOOLEAN NOT NULL DEFAULT false,
  valor_fgts            NUMERIC(14,2),
  usa_subsidio          BOOLEAN NOT NULL DEFAULT false,
  valor_subsidio        NUMERIC(14,2),
  imagem_consulta_url   TEXT,
  observacao            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_avaliacoes_cliente ON avaliacoes(cliente_id);
CREATE INDEX idx_avaliacoes_parceiro ON avaliacoes(parceiro_id);
CREATE TRIGGER trg_avaliacoes_updated_at BEFORE UPDATE ON avaliacoes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE andamentos (
  id                             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_legado                      TEXT UNIQUE,
  data_inicio                    DATE,
  cliente_vendedor_id            UUID REFERENCES clientes(id),
  abrir_conta                    BOOLEAN DEFAULT false,
  avaliacao_id                   UUID NOT NULL REFERENCES avaliacoes(id),
  imovel_id                      UUID REFERENCES imoveis(id),  -- nullable: há órfão conhecido na base legada
  tipo_contrato                  TEXT CHECK (tipo_contrato IN ('Contrato Físico','Contrato Híbrido','Contrato Nato','Contrato Internalizado')),
  status_andamento               TEXT NOT NULL DEFAULT 'Em andamento',
  status_andamento_complementar  TEXT,
  processo                       TEXT,
  valor_avaliado                 NUMERIC(14,2),
  valor_venda                    NUMERIC(14,2),
  tem_entrada                    BOOLEAN,
  valor_recurso                  NUMERIC(14,2),
  valor_fgts                     NUMERIC(14,2),
  subsidio                       NUMERIC(14,2),
  valor_financiado               NUMERIC(14,2),
  observacao                     TEXT,
  data_conclusao                 DATE,
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_andamentos_avaliacao ON andamentos(avaliacao_id);
CREATE INDEX idx_andamentos_imovel ON andamentos(imovel_id);
CREATE TRIGGER trg_andamentos_updated_at BEFORE UPDATE ON andamentos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMENT ON COLUMN andamentos.status_andamento IS
  'Regra de negócio (aplicar na camada de serviço, ao salvar): quando mudar para ''Concluído'', '
  'atualizar automaticamente avaliacoes.status da avaliacao_id vinculada para ''Concluído''. '
  'No AppSheet, status_andamento e status_andamento_complementar são referências a tabelas de domínio '
  '(StatusAndamento/StatusAndamentoCom) com lista aberta, por isso ficam sem CHECK — ver seção de status '
  'dinâmicos no README antes de travar valores fixos aqui.';

CREATE TABLE lancamentos_financiamento (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_legado          TEXT UNIQUE,
  andamento_id       UUID NOT NULL REFERENCES andamentos(id),
  valor_financiado   NUMERIC(14,2),
  remuneracao        NUMERIC(14,2),
  status             TEXT NOT NULL DEFAULT 'Previsão' CHECK (status IN ('Previsão','Confirmado','Pago')),
  data_pagamento     DATE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lancamentos_fin_andamento ON lancamentos_financiamento(andamento_id);

-- ============================================================
-- 5. VENDA E LOCAÇÃO
-- ============================================================

CREATE TABLE gestoes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_legado             TEXT UNIQUE,
  parceiro_id           UUID REFERENCES parceiros(id),
  data_cadastro         DATE NOT NULL DEFAULT CURRENT_DATE,
  cliente_id            UUID NOT NULL REFERENCES clientes(id),   -- proprietário
  imovel_id             UUID NOT NULL REFERENCES imoveis(id),
  valor_venda           NUMERIC(14,2),
  prazo_gestao_meses    SMALLINT,
  porc_honorario        NUMERIC(6,4),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gestoes_cliente ON gestoes(cliente_id);
CREATE INDEX idx_gestoes_imovel ON gestoes(imovel_id);
CREATE TRIGGER trg_gestoes_updated_at BEFORE UPDATE ON gestoes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMENT ON TABLE gestoes IS 'Contrato de exclusividade de venda firmado com o proprietário (diferente de adm_imoveis, que é administração de locação).';

CREATE TABLE adm_imoveis (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_legado              TEXT UNIQUE,
  data_entrada           DATE,
  pasta_url              TEXT,
  loja_id                UUID NOT NULL REFERENCES lojas(id),
  cliente_id             UUID NOT NULL REFERENCES clientes(id),   -- proprietário
  parceiro_id            UUID REFERENCES parceiros(id),
  imovel_id              UUID NOT NULL REFERENCES imoveis(id),
  status                 TEXT NOT NULL DEFAULT 'Ativo' CHECK (status IN ('Captação','Ativo','Locado','Encerrado')),
  data_assinatura        DATE,
  prazo_contrato_meses   SMALLINT,
  valor_transacao        NUMERIC(14,2),
  porc_honorario         NUMERIC(6,4),
  tx_administracao       NUMERIC(6,4),
  valor_cliente          NUMERIC(14,2),
  valor_administracao    NUMERIC(14,2),
  iptu                   NUMERIC(14,2),
  tem_vistoria           BOOLEAN,
  arquivo_vistoria_url   TEXT,
  tem_condominio         BOOLEAN,   -- 'Condominio' Sim/Não no AppSheet (distinto do valor abaixo)
  condominio             NUMERIC(14,2),
  -- CORRIGIDO: no AppSheet "Água" e "Energia" não são booleanos, e sim a origem/situação da ligação
  agua                   TEXT CHECK (agua IN ('Água da caerd','Água do condomínio','Água do poço')),
  uc_caerd               TEXT,
  energia                TEXT CHECK (energia IN ('Ligada','Desligada com relógio','Desligada sem relógio')),
  uc_energisa            TEXT,
  observacao             TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_adm_imoveis_cliente ON adm_imoveis(cliente_id);
CREATE INDEX idx_adm_imoveis_imovel ON adm_imoveis(imovel_id);
CREATE INDEX idx_adm_imoveis_loja ON adm_imoveis(loja_id);
CREATE TRIGGER trg_adm_imoveis_updated_at BEFORE UPDATE ON adm_imoveis
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMENT ON TABLE adm_imoveis IS 'Contrato de administração de locação com o proprietário. Sempre operado pela loja de Porto Velho, independente de onde o imóvel foi captado.';

CREATE TABLE transacoes (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_legado                   TEXT UNIQUE,
  tipo                        TEXT NOT NULL CHECK (tipo IN ('Compra e Venda','Locação')),
  adm_imovel_id               UUID REFERENCES adm_imoveis(id),   -- nullable: há órfão conhecido na base legada
  pasta_url                   TEXT,
  cliente_id                  UUID NOT NULL REFERENCES clientes(id),   -- proprietário/locador
  cliente_contraparte_id      UUID NOT NULL REFERENCES clientes(id),   -- comprador/locatário (era "Cliente1")
  imovel_id                   UUID REFERENCES imoveis(id),             -- nullable: há órfãos conhecidos na base legada
  status                      TEXT,   -- referência a tabela de domínio "Status" no AppSheet (lista aberta, sem CHECK aqui)
  garantia                    TEXT CHECK (garantia IN ('Fiador','Caução','Seguro fiança','Sem garantias')),
  valor_caucao                NUMERIC(14,2),
  pg_caucao                   TEXT,
  data_assinatura             DATE,
  data_vencimento             DATE,
  dia_vencimento              SMALLINT,
  loja_id                     UUID NOT NULL REFERENCES lojas(id),
  tem_parceria                BOOLEAN NOT NULL DEFAULT false,
  porc_parceria               NUMERIC(6,4),
  parceiro_externo_id         UUID REFERENCES parceiros(id),
  corretor_proprietario_id    UUID REFERENCES parceiros(id),   -- era "CorretorCliente"
  corretor_contraparte_id     UUID REFERENCES parceiros(id),   -- era "CorretorCliente1"
  status_honorario            TEXT NOT NULL DEFAULT 'Pendente' CHECK (status_honorario IN ('Pago','Pendente','Parcelado')),
  parcela                     TEXT,
  data_pagamento              DATE,
  valor_transacao             NUMERIC(14,2) NOT NULL,
  chave                       TEXT CHECK (chave IN (
                                  'na assinatura do contrato de compra e venda','na assinatura do contrato de financiamento',
                                  'na quitação de todos os itens da cláusula terceira','30 dias após a quitação da cláusula terceira'
                              )),   -- momento de entrega das chaves, usado no cálculo de risco de posse
  porc_honorario               NUMERIC(6,4) NOT NULL DEFAULT 0,
  porc_corretor_proprietario   NUMERIC(6,4) NOT NULL DEFAULT 0,
  porc_corretor_contraparte    NUMERIC(6,4) NOT NULL DEFAULT 0,
  porc_imobiliaria              NUMERIC(6,4) NOT NULL DEFAULT 0,   -- NOVO: parte explícita da imobiliária no rateio (ver seção 2.5/5 da Especificação)
  eh_administracao             BOOLEAN DEFAULT false,
  tx_administracao             NUMERIC(6,4),
  valor_cliente                NUMERIC(14,2),
  valor_administracao          NUMERIC(14,2),
  iptu                         NUMERIC(14,2),
  trsd                         NUMERIC(14,2),   -- valor do TRSD quando fracionado/lançado nas mensalidades da locação (mesmo padrão do iptu acima)
  boleto_emitido               BOOLEAN NOT NULL DEFAULT false,   -- toggle rápido: boleto do mês já gerado/enviado (só relevante quando forma_pagamento = 'Boleto')
  -- 'Encargos' é EnumList (multivalorado) no AppSheet: armazenado como array de texto
  encargos                     TEXT[] CHECK (encargos <@ ARRAY[
                                   'IPTU do ano vigente ao andamento do contrato','TRSD do ano vigente ao andamento do contrato',
                                   'Condomínio','Água','Energia elétrica','Gás'
                               ]::TEXT[]),
  forma_pagamento              TEXT CHECK (forma_pagamento IN ('Pix','Boleto')),
  finalidade_locacao            TEXT CHECK (finalidade_locacao IN ('Residencial','Comercial','Mista')),
  atividade                     TEXT,
  tem_vistoria                  BOOLEAN,
  arquivo_vistoria_url          TEXT,
  observacao                    TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_transacoes_cliente ON transacoes(cliente_id);
CREATE INDEX idx_transacoes_contraparte ON transacoes(cliente_contraparte_id);
CREATE INDEX idx_transacoes_imovel ON transacoes(imovel_id);
CREATE INDEX idx_transacoes_adm_imovel ON transacoes(adm_imovel_id);
CREATE INDEX idx_transacoes_loja ON transacoes(loja_id);
CREATE INDEX idx_transacoes_corretor_proprietario ON transacoes(corretor_proprietario_id);
CREATE INDEX idx_transacoes_corretor_contraparte ON transacoes(corretor_contraparte_id);
CREATE TRIGGER trg_transacoes_updated_at BEFORE UPDATE ON transacoes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMENT ON TABLE transacoes IS
  'Entidade central: venda ou locação. cliente_id = proprietário/locador; cliente_contraparte_id = comprador/locatário. '
  'corretor_proprietario_id e corretor_contraparte_id podem ser o mesmo parceiro (corretor único) — nesse caso a aplicação '
  'deve somar porc_corretor_proprietario + porc_corretor_contraparte para calcular o valor devido a ele.';
COMMENT ON COLUMN transacoes.porc_imobiliaria IS
  'Regra de negócio (validar na aplicação antes de fechar a transação): '
  'porc_corretor_proprietario + porc_corretor_contraparte + (porc_parceria, se tem_parceria) + porc_imobiliaria '
  'deve fechar 100% do honorário. Se não fechar, a aplicação deve alertar em vez de deixar sobra implícita.';

CREATE TABLE condicoes_pagamento (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_legado         TEXT UNIQUE,
  transacao_id      UUID NOT NULL REFERENCES transacoes(id) ON DELETE CASCADE,
  tipo              TEXT CHECK (tipo IN ('Entrada','Saldo','Financiamento','Permuta','Parcelado')),
  valor             NUMERIC(14,2) NOT NULL,
  descricao         TEXT,
  descricao_ia      TEXT,
  forma_pagamento   TEXT CHECK (forma_pagamento IN ('pix','transferência bancária','dinheiro','parcelado')),
  parcelas          SMALLINT,
  momento           TEXT CHECK (momento IN (
                        'assinatura do contrato de compra e venda','conforme parcelas','assinatura do contrato de financiamento'
                    )),
  data_pagamento    DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_condicoes_pg_transacao ON condicoes_pagamento(transacao_id);
COMMENT ON TABLE condicoes_pagamento IS 'A soma de valor para uma transacao_id deve fechar com transacoes.valor_transacao (validar na aplicação).';

CREATE TABLE chaves (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_legado      TEXT UNIQUE,
  transacao_id   UUID NOT NULL REFERENCES transacoes(id) ON DELETE CASCADE,
  foto_url       TEXT,
  data           DATE,
  termo_gerado   BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chaves_transacao ON chaves(transacao_id);

CREATE TABLE recibos_locacao (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_legado         TEXT UNIQUE,
  tipo              TEXT,
  transacao_id      UUID NOT NULL REFERENCES transacoes(id) ON DELETE CASCADE,
  desconto          NUMERIC(14,2),
  valor_descontado  NUMERIC(14,2),
  observacao        TEXT,
  arquivo_url       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_recibos_locacao_transacao ON recibos_locacao(transacao_id);

CREATE TABLE encerramentos_transacao (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_legado              TEXT UNIQUE,
  transacao_id           UUID NOT NULL UNIQUE REFERENCES transacoes(id) ON DELETE CASCADE,
  tipo_transacao         TEXT,
  status_final           TEXT,   -- referência a tabela de domínio "Status" no AppSheet (lista aberta, sem CHECK aqui)
  data_encerramento      DATE,
  motivo_principal       TEXT CHECK (motivo_principal IN (
                             'Desistência do cliente','Reprovação cadastral','Problema documental','Falta de pagamento',
                             'Distrato amigável','Imóvel indisponível','Falha operacional','Outro'
                         )),
  motivo_secundario      TEXT,
  parceiro_id            UUID REFERENCES parceiros(id),
  falha_interna          BOOLEAN,
  falha_cliente          BOOLEAN,
  falha_imovel           BOOLEAN,
  falha_financeira       BOOLEAN,
  descricao_livre        TEXT,
  acao_corretiva         TEXT,
  enviar_analise_ia      BOOLEAN NOT NULL DEFAULT false,
  resumo_ia              TEXT,
  classificacao_ia       TEXT CHECK (classificacao_ia IN (
                             'Perda comercial','Falha documental','Risco financeiro',
                             'Ruptura contratual','Inadimplência','Processo saudável encerrado'
                         )),
  risco_ia               TEXT CHECK (risco_ia IN ('Baixo','Médio','Alto')),
  observacao_risco_ia    TEXT,
  email_enviado          BOOLEAN NOT NULL DEFAULT false,
  data_envio_email       TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 6. FINANCEIRO
-- ============================================================

CREATE TABLE pagamentos (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_legado          TEXT UNIQUE,
  status             TEXT NOT NULL DEFAULT 'Pendente' CHECK (status IN ('Pendente','Pago')),
  transacao_id       UUID NOT NULL REFERENCES transacoes(id),
  cliente_id         UUID REFERENCES clientes(id),
  tipo               TEXT,   -- provavelmente espelha transacoes.tipo (não confirmado como Enum próprio no AppSheet)
  parceiro_id        UUID NOT NULL REFERENCES parceiros(id),
  parte              TEXT CHECK (parte IN (
                          'Parte proprietária','Parte interessada','Coordenação de vendas','Parte proprietária / Interessada'
                      )),
  porcentagem        NUMERIC(6,4),
  desconto           NUMERIC(14,2),
  observacao         TEXT,
  valor_honorario    NUMERIC(14,2),
  valor_parceiro     NUMERIC(14,2),
  data_recebimento   DATE,
  data_pagamento     DATE,
  reportado          BOOLEAN NOT NULL DEFAULT false,
  valor_report       NUMERIC(14,2),
  data_report        DATE,
  arquivo_url        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pagamentos_transacao ON pagamentos(transacao_id);
CREATE INDEX idx_pagamentos_parceiro ON pagamentos(parceiro_id);
CREATE TRIGGER trg_pagamentos_updated_at BEFORE UPDATE ON pagamentos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMENT ON TABLE pagamentos IS 'Um recibo por perna do rateio de honorário (corretor proprietário, corretor contraparte, parceiro externo, imobiliária).';

CREATE TABLE movimentacoes (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_legado                 TEXT UNIQUE,
  tipo                      TEXT NOT NULL CHECK (tipo IN ('Despesa','Recebimento')),
  categoria_id              UUID NOT NULL REFERENCES categorias_financeiras(id),
  transacao_id               UUID REFERENCES transacoes(id),
  contraparte_nome           TEXT,
  parceiro_id                 UUID REFERENCES parceiros(id),
  pagamento_id                UUID REFERENCES pagamentos(id),
  descricao                   TEXT,
  valor                        NUMERIC(14,2) NOT NULL,
  forma_pagamento              TEXT CHECK (forma_pagamento IN ('À vista','Parcelado','Recorrente')),
  parcelas                     SMALLINT,
  num_parcela                  SMALLINT,
  id_parcelamento              UUID,   -- agrupa as parcelas de um mesmo lançamento recorrente
  vencimento                   DATE NOT NULL,
  pago                         BOOLEAN NOT NULL DEFAULT false,
  data_pagamento               DATE,
  comprovante_url              TEXT,
  gerado_automaticamente       BOOLEAN NOT NULL DEFAULT false,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_movimentacoes_transacao ON movimentacoes(transacao_id);
CREATE INDEX idx_movimentacoes_categoria ON movimentacoes(categoria_id);
CREATE INDEX idx_movimentacoes_parceiro ON movimentacoes(parceiro_id);
CREATE INDEX idx_movimentacoes_parcelamento ON movimentacoes(id_parcelamento);
CREATE TRIGGER trg_movimentacoes_updated_at BEFORE UPDATE ON movimentacoes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMENT ON TABLE movimentacoes IS 'Livro-caixa central: toda entrada/saída financeira, ligada ou não a uma transação.';

CREATE TABLE contratos_corretor (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_legado     TEXT UNIQUE,
  status        TEXT NOT NULL DEFAULT 'Contrato ativo' CHECK (status IN ('Contrato ativo','Contrato distratado')),
  parceiro_id   UUID NOT NULL REFERENCES parceiros(id),
  funcao        TEXT,
  fee           NUMERIC(12,2),
  porc_compr    NUMERIC(6,4),
  porc_vend     NUMERIC(6,4),
  dia_fee       SMALLINT,
  cidade_id     UUID REFERENCES cidades(id),
  estado_id     UUID REFERENCES estados(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_contratos_corretor_parceiro ON contratos_corretor(parceiro_id);
CREATE TRIGGER trg_contratos_corretor_updated_at BEFORE UPDATE ON contratos_corretor
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE relatorios (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_inicial      DATE,
  data_final        DATE,
  tipo_relatorio    TEXT CHECK (tipo_relatorio IN ('Locação','Compra e Venda','Corretores')),
  parceiro_id       UUID REFERENCES parceiros(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 7. MOTOR DE DOCUMENTOS (substitui os Logs + AutoCrat do AppSheet)
-- ============================================================

-- 9 modelos confirmados na análise do editor AppSheet (ações "Gerar..." + bots MakeDoc),
-- não apenas os 3 contratos originalmente cogitados:
--   1. contrato_locacao            (Transacao,   ação "Gerar Contrato de Locação")
--   2. contrato_compra_venda       (Transacao,   ação "Gerar Contrato Compra e Venda")
--   3. carta_preferencia           (Transacao,   ação "Gerar Carte de Preferência")
--   4. contrato_administracao      (AdmImovel,   ação "Gerar Contrato")
--   5. contrato_associacao_corretor(ContCorretor/Parceiro, ação "Contrato de associação")
--   6. termo_entrega_chaves        (Chaves,      ação "Entrega de Chaves" / Open Url GerarTermo)
--   7. recibo_honorarios           (Movimentacao, bot "Recibo Honorários 2", MakeDoc nativo)
--   8. repasse_administracao       (Movimentacao, bot "Repasse administração 2", MakeDoc nativo)
--   9. repasse_primeira_locacao    (Movimentacao, bot "Repasse Primeira Locação", MakeDoc nativo)
CREATE TABLE documentos_gerados (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- gestao e proposta foram adicionados depois dos 9 modelos originais
  -- (contrato de Gestão e Proposta de Compra e Venda do portal do corretor)
  -- — ficaram de fora do CHECK por um tempo até isso quebrar a geração real
  -- (violava o constraint tanto no sucesso quanto ao logar o próprio erro).
  entidade_tipo             TEXT NOT NULL CHECK (entidade_tipo IN (
                                'transacao','adm_imovel','cont_corretor','cont_corretor_estagiario',
                                'parceiro','chaves','movimentacao','gestao','proposta'
                            )),
  entidade_id               UUID NOT NULL,
  tipo_documento            TEXT NOT NULL CHECK (tipo_documento IN (
                                'contrato_locacao','contrato_compra_venda','carta_preferencia',
                                'contrato_administracao','contrato_associacao_corretor',
                                'contrato_associacao_corretor_estagiario','termo_entrega_chaves',
                                'recibo_honorarios','repasse_administracao','repasse_primeira_locacao',
                                'contrato_gestao','proposta_compra_venda'
                            )),
  arquivo_url               TEXT,
  gerado_por_usuario_id     UUID REFERENCES usuarios(id),
  status                    TEXT NOT NULL DEFAULT 'Sucesso' CHECK (status IN ('Sucesso','Erro')),
  mensagem                  TEXT,
  gerado_em                 TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_documentos_entidade ON documentos_gerados(entidade_tipo, entidade_id);
COMMENT ON TABLE documentos_gerados IS 'Auditoria nativa de geração de documentos, substituindo LogContratoParceiro/LogContratoAdm/LogPastaImovel e a aba do AutoCrat. Ver lista completa dos 9 modelos nos comentários acima.';

-- ============================================================
-- 8. METAS E DESEMPENHO DE PARCEIROS (novo módulo, não existia no AppSheet)
-- ============================================================

CREATE TABLE metas (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parceiro_id             UUID REFERENCES parceiros(id),   -- NULL = meta agregada da loja inteira
  loja_id                 UUID REFERENCES lojas(id),
  tipo_meta               TEXT NOT NULL CHECK (tipo_meta IN (
                              'Vendas_Fechadas','Locacoes_Fechadas','Honorarios_Recebidos',
                              'Captacoes_Imovel','Avaliacoes_Aprovadas','Novos_Clientes'
                          )),
  unidade                 TEXT NOT NULL CHECK (unidade IN ('Valor (R$)','Quantidade')),
  periodo_tipo            TEXT NOT NULL CHECK (periodo_tipo IN ('Mensal','Trimestral','Semestral','Anual')),
  periodo_inicio          DATE NOT NULL,
  periodo_fim             DATE NOT NULL,
  valor_meta              NUMERIC(14,2) NOT NULL CHECK (valor_meta > 0),
  observacao              TEXT,
  criado_por_usuario_id   UUID REFERENCES usuarios(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (periodo_fim >= periodo_inicio),
  CHECK (parceiro_id IS NOT NULL OR loja_id IS NOT NULL)
);
CREATE INDEX idx_metas_parceiro ON metas(parceiro_id);
CREATE INDEX idx_metas_loja ON metas(loja_id);
CREATE INDEX idx_metas_periodo ON metas(periodo_inicio, periodo_fim);
CREATE TRIGGER trg_metas_updated_at BEFORE UPDATE ON metas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMENT ON TABLE metas IS
  'Metas individuais (por corretor) ou coletivas (por loja) de vendas, locações, honorários, '
  'captação de imóveis, avaliações aprovadas ou novos clientes. O valor realizado NÃO é armazenado '
  'aqui — é sempre calculado ao vivo pela view vw_metas_progresso, para nunca ficar dessincronizado '
  'dos dados reais de transacoes/pagamentos/imoveis/avaliacoes/clientes.';

-- View: progresso de cada meta, calculado dinamicamente a partir dos dados operacionais.
CREATE VIEW vw_metas_progresso AS
SELECT
  m.*,
  CASE m.tipo_meta
    WHEN 'Vendas_Fechadas' THEN (
      SELECT CASE WHEN m.unidade = 'Valor (R$)' THEN COALESCE(SUM(t.valor_transacao),0) ELSE COUNT(*) END
      FROM transacoes t
      WHERE t.tipo = 'Compra e Venda'
        AND t.data_assinatura BETWEEN m.periodo_inicio AND m.periodo_fim
        AND (m.parceiro_id IS NULL OR t.corretor_proprietario_id = m.parceiro_id OR t.corretor_contraparte_id = m.parceiro_id)
        AND (m.loja_id IS NULL OR t.loja_id = m.loja_id)
    )
    WHEN 'Locacoes_Fechadas' THEN (
      SELECT CASE WHEN m.unidade = 'Valor (R$)' THEN COALESCE(SUM(t.valor_transacao),0) ELSE COUNT(*) END
      FROM transacoes t
      WHERE t.tipo = 'Locação'
        AND t.data_assinatura BETWEEN m.periodo_inicio AND m.periodo_fim
        AND (m.parceiro_id IS NULL OR t.corretor_proprietario_id = m.parceiro_id OR t.corretor_contraparte_id = m.parceiro_id)
        AND (m.loja_id IS NULL OR t.loja_id = m.loja_id)
    )
    WHEN 'Honorarios_Recebidos' THEN (
      SELECT COALESCE(SUM(p.valor_parceiro),0)
      FROM pagamentos p
      WHERE p.status = 'Pago'
        AND p.data_pagamento BETWEEN m.periodo_inicio AND m.periodo_fim
        AND (m.parceiro_id IS NULL OR p.parceiro_id = m.parceiro_id)
    )
    WHEN 'Captacoes_Imovel' THEN (
      SELECT COUNT(*)
      FROM imoveis i
      WHERE i.data_cadastro BETWEEN m.periodo_inicio AND m.periodo_fim
        AND (m.parceiro_id IS NULL OR i.parceiro_id = m.parceiro_id)
    )
    WHEN 'Avaliacoes_Aprovadas' THEN (
      SELECT COUNT(*)
      FROM avaliacoes a
      WHERE a.status = 'Aprovado'
        AND a.data_avaliacao BETWEEN m.periodo_inicio AND m.periodo_fim
        AND (m.parceiro_id IS NULL OR a.parceiro_id = m.parceiro_id)
    )
    WHEN 'Novos_Clientes' THEN (
      SELECT COUNT(*)
      FROM clientes c
      WHERE c.data_cadastro BETWEEN m.periodo_inicio AND m.periodo_fim
        AND (m.parceiro_id IS NULL OR c.parceiro_id = m.parceiro_id)
    )
  END AS valor_realizado
FROM metas m;
COMMENT ON VIEW vw_metas_progresso IS
  'Adiciona valor_realizado a cada meta. O percentual (realizado/meta*100) é calculado na aplicação '
  'para poder aplicar as faixas de cor (verde >=100%, amarelo 70-99%, vermelho <70%) sem duplicar lógica em SQL.';

-- View: ranking do mês corrente entre corretores ativos (gamificação/leaderboard).
CREATE VIEW vw_ranking_mes_atual AS
SELECT
  par.id AS parceiro_id,
  par.nome,
  par.loja_id,
  (SELECT COUNT(*) FROM transacoes t
     WHERE t.tipo = 'Compra e Venda'
       AND (t.corretor_proprietario_id = par.id OR t.corretor_contraparte_id = par.id)
       AND date_trunc('month', t.data_assinatura) = date_trunc('month', CURRENT_DATE)
  ) AS vendas_fechadas_mes,
  (SELECT COUNT(*) FROM transacoes t
     WHERE t.tipo = 'Locação'
       AND (t.corretor_proprietario_id = par.id OR t.corretor_contraparte_id = par.id)
       AND date_trunc('month', t.data_assinatura) = date_trunc('month', CURRENT_DATE)
  ) AS locacoes_fechadas_mes,
  (SELECT COALESCE(SUM(p.valor_parceiro),0) FROM pagamentos p
     WHERE p.parceiro_id = par.id AND p.status = 'Pago'
       AND date_trunc('month', p.data_pagamento) = date_trunc('month', CURRENT_DATE)
  ) AS honorarios_recebidos_mes
FROM parceiros par
WHERE par.funcao IN ('Corretor','Corretor Estagiário')
  AND par.status_funcao = 'Ativo';
COMMENT ON VIEW vw_ranking_mes_atual IS 'Base para o leaderboard mensal de corretores ativos (Porto Velho + Jaru juntos; filtrar por loja_id na aplicação quando quiser separar).';

-- ============================================================
-- FIM
-- ============================================================
