export type TipoDocumento =
  | "contrato_locacao"
  | "contrato_compra_venda"
  | "carta_preferencia"
  | "contrato_administracao"
  | "contrato_associacao_corretor"
  | "contrato_associacao_corretor_estagiario"
  | "termo_entrega_chaves"
  | "recibo_honorarios"
  | "repasse_administracao"
  | "repasse_primeira_locacao";

export type CampoDocumento = {
  campo: string;
  descricao: string;
};

// Cada entrada é o dicionário de placeholders que o arquivo .docx correspondente
// (em site/app-web/templates/) precisa conter, no formato {{campo}}.
// Ver templates/README.md para instruções de como editar o Word sem mexer em código.
export const CAMPOS_DOCUMENTO: Record<TipoDocumento, CampoDocumento[]> = {
  contrato_locacao: [
    { campo: "loja_nome", descricao: "Porto Velho ou Jaru" },
    { campo: "proprietario_nome", descricao: "Nome completo do locador" },
    { campo: "proprietario_cpf", descricao: "CPF formatado do locador" },
    { campo: "proprietario_estado_civil", descricao: "Estado civil do locador" },
    { campo: "locatario_nome", descricao: "Nome completo do locatário" },
    { campo: "locatario_cpf", descricao: "CPF formatado do locatário" },
    { campo: "imovel_endereco", descricao: "Endereço completo do imóvel" },
    { campo: "finalidade_locacao", descricao: "Residencial, Comercial ou Mista" },
    { campo: "valor_transacao", descricao: "Valor do aluguel em R$ (número)" },
    { campo: "valor_transacao_extenso", descricao: "Valor do aluguel por extenso" },
    { campo: "dia_vencimento", descricao: "Dia do mês de vencimento do aluguel" },
    { campo: "prazo_contrato_meses", descricao: "Duração do contrato em meses" },
    { campo: "garantia", descricao: "Fiador, Caução, Seguro fiança ou Sem garantias" },
    { campo: "encargos_lista", descricao: "Lista de encargos por conta do locatário" },
    { campo: "data_assinatura", descricao: "Data de assinatura (dd/mm/aaaa)" },
    { campo: "data_assinatura_extenso", descricao: "Data de assinatura por extenso" }
  ],
  contrato_compra_venda: [
    { campo: "loja_nome", descricao: "Porto Velho ou Jaru" },
    { campo: "vendedor_nome", descricao: "Nome completo do vendedor" },
    { campo: "vendedor_cpf", descricao: "CPF formatado do vendedor" },
    { campo: "comprador_nome", descricao: "Nome completo do comprador" },
    { campo: "comprador_cpf", descricao: "CPF formatado do comprador" },
    { campo: "imovel_endereco", descricao: "Endereço completo do imóvel" },
    { campo: "imovel_matricula", descricao: "Número de matrícula do imóvel" },
    { campo: "valor_transacao", descricao: "Valor da venda em R$ (número)" },
    { campo: "valor_transacao_extenso", descricao: "Valor da venda por extenso" },
    { campo: "condicoes_pagamento_lista", descricao: "Entrada, saldo, financiamento etc., um por linha" },
    { campo: "data_assinatura", descricao: "Data de assinatura (dd/mm/aaaa)" },
    { campo: "data_assinatura_extenso", descricao: "Data de assinatura por extenso" }
  ],
  carta_preferencia: [
    { campo: "proprietario_nome", descricao: "Nome completo do proprietário" },
    { campo: "imovel_endereco", descricao: "Endereço completo do imóvel" },
    { campo: "valor_venda", descricao: "Valor pretendido de venda em R$" },
    { campo: "prazo_gestao_meses", descricao: "Prazo de exclusividade em meses" },
    { campo: "porc_honorario", descricao: "Percentual de honorário combinado" },
    { campo: "data_emissao", descricao: "Data de emissão da carta" }
  ],
  contrato_administracao: [
    {
      campo: "Proprietarios",
      descricao:
        "Lista de proprietários do imóvel (loop — um bloco de qualificação e um bloco de assinatura por item: Nome, Nacionalidade, Profissao, EstadoCivil, Cpf, Endereco). Se houver cônjuge, ele entra como mais um item da lista."
    },
    { campo: "Cliente", descricao: "Nome do primeiro proprietário da lista (usado no Favorecido dos dados bancários)" },
    { campo: "Banco", descricao: "Banco do primeiro proprietário da lista" },
    { campo: "Codigo", descricao: "Código do banco do primeiro proprietário" },
    { campo: "Agencia", descricao: "Agência do primeiro proprietário" },
    { campo: "Conta", descricao: "Conta corrente do primeiro proprietário" },
    { campo: "TipoPix", descricao: "Tipo de chave PIX do primeiro proprietário" },
    { campo: "Pix", descricao: "Chave PIX do primeiro proprietário" },
    { campo: "Imovel_Endereco", descricao: "Endereço completo do imóvel" },
    { campo: "Imovel_Matricula", descricao: "Número de matrícula do imóvel" },
    { campo: "InscricaoFormatada", descricao: "Inscrição imobiliária formatada" },
    { campo: "Imovel_Descricao", descricao: "Descrição do imóvel" },
    { campo: "PorcHonorario", descricao: "Percentual do honorário na intermediação" },
    { campo: "TxAdm", descricao: "Percentual da taxa de administração" },
    { campo: "Loja", descricao: "Porto Velho ou Jaru" },
    { campo: "DataAssinatura", descricao: "Data de assinatura por extenso, dia em 2 dígitos" }
  ],
  // Dois modelos distintos, cada um com seu próprio arquivo .docx e sua
  // própria busca (só aparece parceiro com a função correspondente): Corretor
  // usa contrato_associacao_corretor.docx, Corretor Estagiário usa
  // contrato_associacao_corretor_estagiario.docx. Mesmo conjunto de campos
  // nos dois — o template do estagiário simplesmente não usa {{Creci}}.
  contrato_associacao_corretor: [
    { campo: "Parceiro", descricao: "Nome completo do corretor parceiro" },
    { campo: "EstadoCivil", descricao: "Estado civil do parceiro" },
    { campo: "DataNascimento", descricao: "Data de nascimento (dd/mm/aaaa)" },
    { campo: "CPF", descricao: "CPF formatado do corretor" },
    { campo: "Creci", descricao: "Número do CRECI" },
    { campo: "Email", descricao: "E-mail do parceiro" },
    { campo: "Telefone", descricao: "Telefone formatado do parceiro" },
    { campo: "Endereco", descricao: "Endereço residencial do parceiro" },
    { campo: "Fee", descricao: "Valor de fee mensal, se houver" },
    { campo: "PorcCompr", descricao: "Percentual em transações de compra" },
    { campo: "PorcVend", descricao: "Percentual em transações de venda" },
    { campo: "DiaFee", descricao: "Dia do mês de cobrança do fee" },
    { campo: "Cidade", descricao: "Cidade da loja do parceiro" },
    { campo: "Estado", descricao: "Estado da loja do parceiro" },
    { campo: "DataEntrada", descricao: "Data de início da associação" }
  ],
  contrato_associacao_corretor_estagiario: [
    { campo: "Parceiro", descricao: "Nome completo do corretor estagiário" },
    { campo: "EstadoCivil", descricao: "Estado civil do parceiro" },
    { campo: "DataNascimento", descricao: "Data de nascimento (dd/mm/aaaa)" },
    { campo: "CPF", descricao: "CPF formatado do parceiro" },
    { campo: "Email", descricao: "E-mail do parceiro" },
    { campo: "Telefone", descricao: "Telefone formatado do parceiro" },
    { campo: "Endereco", descricao: "Endereço residencial do parceiro" },
    { campo: "Fee", descricao: "Valor de fee mensal, se houver" },
    { campo: "PorcCompr", descricao: "Percentual em transações de compra" },
    { campo: "PorcVend", descricao: "Percentual em transações de venda" },
    { campo: "DiaFee", descricao: "Dia do mês de cobrança do fee" },
    { campo: "Cidade", descricao: "Cidade da loja do parceiro" },
    { campo: "Estado", descricao: "Estado da loja do parceiro" },
    { campo: "DataEntrada", descricao: "Data de início da associação" }
  ],
  termo_entrega_chaves: [
    { campo: "transacao_tipo", descricao: "Locação ou Compra e Venda" },
    { campo: "imovel_endereco", descricao: "Endereço completo do imóvel" },
    { campo: "recebedor_nome", descricao: "Nome de quem recebe as chaves (locatário ou comprador)" },
    { campo: "corretor_responsavel", descricao: "Nome do corretor que acompanhou a entrega" },
    { campo: "data_entrega", descricao: "Data da entrega das chaves" }
  ],
  recibo_honorarios: [
    { campo: "parceiro_nome", descricao: "Nome do corretor que recebe o honorário" },
    { campo: "transacao_referencia", descricao: "Identificação da transação de origem" },
    { campo: "valor_honorario", descricao: "Valor do honorário em R$ (número)" },
    { campo: "valor_honorario_extenso", descricao: "Valor do honorário por extenso" },
    { campo: "categoria", descricao: "Categoria financeira do lançamento" },
    { campo: "data_pagamento", descricao: "Data do pagamento" }
  ],
  repasse_administracao: [
    { campo: "proprietario_nome", descricao: "Nome do proprietário que recebe o repasse" },
    { campo: "imovel_endereco", descricao: "Endereço completo do imóvel" },
    { campo: "mes_referencia", descricao: "Mês/ano de referência do repasse" },
    { campo: "valor_administracao", descricao: "Valor retido de taxa de administração" },
    { campo: "valor_repasse", descricao: "Valor líquido repassado ao proprietário" },
    { campo: "data_repasse", descricao: "Data do repasse" }
  ],
  repasse_primeira_locacao: [
    { campo: "proprietario_nome", descricao: "Nome do proprietário que recebe o repasse" },
    { campo: "locatario_nome", descricao: "Nome do locatário" },
    { campo: "imovel_endereco", descricao: "Endereço completo do imóvel" },
    { campo: "mes_referencia", descricao: "Mês/ano de referência do repasse" },
    { campo: "valor_repasse", descricao: "Valor líquido do primeiro aluguel repassado" },
    { campo: "data_repasse", descricao: "Data do repasse" }
  ]
};
