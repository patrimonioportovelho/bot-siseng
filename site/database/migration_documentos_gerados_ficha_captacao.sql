-- Migração: liberar "ficha_captacao" na CHECK constraint de documentos_gerados (16/11/2026).
-- A constraint tem lista fechada de valores; sem isso, gerar a Ficha de Captação pelo portal do corretor falha com
-- "violates check constraint documentos_gerados_tipo_documento_check". (entidade_tipo continua 'gestao'.)

ALTER TABLE documentos_gerados DROP CONSTRAINT IF EXISTS documentos_gerados_tipo_documento_check;
ALTER TABLE documentos_gerados ADD CONSTRAINT documentos_gerados_tipo_documento_check
  CHECK (tipo_documento IN (
    'contrato_locacao','contrato_locacao_sem_administracao','contrato_compra_venda','carta_preferencia',
    'contrato_administracao','contrato_associacao_corretor','contrato_associacao_corretor_estagiario',
    'termo_entrega_chaves','recibo_honorarios','repasse_administracao','repasse_primeira_locacao',
    'contrato_gestao','proposta_compra_venda','ficha_captacao'
  ));
