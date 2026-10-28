-- Nova função de parceiro: "Recrutados" (candidatos do recrutamento de
-- corretores — leads de anúncio, indicações e redes sociais). Fica logo
-- abaixo de "Corretor Estagiário" na listagem. Pedido do usuário em 28/10/2026.
alter table parceiros drop constraint if exists parceiros_funcao_check;
alter table parceiros add constraint parceiros_funcao_check check (funcao in (
  'Administrativo','Corretor','Corretor Estagiário','Recrutados','Parceiro Externa',
  'Corretor Externo','Imobiliária Externa','Prestador de Serviço',
  'Avaliador Bancário','Desligado'
));
