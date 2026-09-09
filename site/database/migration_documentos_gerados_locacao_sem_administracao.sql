-- Migração: liberar "contrato_locacao_sem_administracao" na CHECK constraint
-- de tipo_documento em documentos_gerados. Novo modelo de contrato para
-- locações em que a JV só intermedeia (não administra): a transação nasce
-- com status "Imóvel em locação sem administração" e o contrato é gerado
-- por esse modelo separado. Sem isso, gerar o documento falha com
-- "violates check constraint documentos_gerados_tipo_documento_check"
-- (tanto no sucesso quanto ao tentar logar o próprio erro).
--
-- entidade_tipo continua "transacao" (já liberado), nada a mexer lá.

ALTER TABLE documentos_gerados DROP CONSTRAINT IF EXISTS documentos_gerados_tipo_documento_check;
ALTER TABLE documentos_gerados ADD CONSTRAINT documentos_gerados_tipo_documento_check
  CHECK (tipo_documento IN (
    'contrato_locacao','contrato_locacao_sem_administracao',
    'contrato_compra_venda','carta_preferencia',
    'contrato_administracao','contrato_associacao_corretor','contrato_associacao_corretor_estagiario',
    'termo_entrega_chaves','recibo_honorarios','repasse_administracao','repasse_primeira_locacao',
    'contrato_gestao','proposta_compra_venda'
  ));
