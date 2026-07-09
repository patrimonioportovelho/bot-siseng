-- Migração: liberar "contrato_gestao"/"gestao" nas CHECK constraints de
-- documentos_gerados. Essas constraints foram criadas direto no banco (fora
-- do Prisma) com uma lista fechada de valores — por isso não apareciam no
-- schema.prisma nem na migração anterior. Sem isso, gerar o contrato de
-- gestão pelo portal falha com "violates check constraint
-- documentos_gerados_tipo_documento_check".
--
-- Aproveitei pra também incluir contrato_associacao_corretor_estagiario /
-- cont_corretor_estagiario, que já existem no código (lib/documentos) mas
-- também não estavam na lista original — mesmo tipo de erro só não
-- apareceu ainda porque esse modelo específico nunca foi gerado.

ALTER TABLE documentos_gerados DROP CONSTRAINT IF EXISTS documentos_gerados_tipo_documento_check;
ALTER TABLE documentos_gerados ADD CONSTRAINT documentos_gerados_tipo_documento_check
  CHECK (tipo_documento IN (
    'contrato_locacao','contrato_compra_venda','carta_preferencia',
    'contrato_administracao','contrato_associacao_corretor','contrato_associacao_corretor_estagiario',
    'termo_entrega_chaves','recibo_honorarios','repasse_administracao','repasse_primeira_locacao',
    'contrato_gestao'
  ));

ALTER TABLE documentos_gerados DROP CONSTRAINT IF EXISTS documentos_gerados_entidade_tipo_check;
ALTER TABLE documentos_gerados ADD CONSTRAINT documentos_gerados_entidade_tipo_check
  CHECK (entidade_tipo IN (
    'transacao','adm_imovel','cont_corretor','cont_corretor_estagiario','parceiro','chaves','movimentacao','gestao'
  ));
