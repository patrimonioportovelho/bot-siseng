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
  | "repasse_primeira_locacao"
  | "contrato_gestao"
  | "proposta_compra_venda";

export type CampoDocumento = {
  campo: string;
  descricao: string;
};

// Cada entrada é o dicionário de placeholders que o arquivo .docx correspondente
// (em site/app-web/templates/) precisa conter, no formato {{campo}}.
// Ver templates/README.md para instruções de como editar o Word sem mexer em código.
export const CAMPOS_DOCUMENTO: Record<TipoDocumento, CampoDocumento[]> = {
  // Modelo novo com QUADRO-RESUMO — Locador(es) e Locatário(s) podem ser mais
  // de um (herdeiros, compra em conjunto etc.); os campos de texto único
  // (Cliente/Cliente1) trazem os nomes/CPFs de todos juntos, e TipoCliente/
  // TipoClienteCliente1 trazem a qualificação completa de todos (loop feito
  // em JS antes de preencher o docx, não é um loop nativo do Docxtemplater).
  contrato_locacao: [
    { campo: "TipoCliente", descricao: "Qualificação completa do(s) Locador(es) — Nome, nacionalidade, profissão, estado civil, CPF/CNPJ, endereço" },
    { campo: "TipoClienteCliente1", descricao: "Qualificação completa do(s) Locatário(s)" },
    { campo: "Cliente", descricao: "Nome(s) do(s) Locador(es), separados por vírgula" },
    { campo: "Cpf/Cnpj", descricao: "CPF/CNPJ do(s) Locador(es), separados por vírgula" },
    { campo: "Cliente1", descricao: "Nome(s) do(s) Locatário(s), separados por vírgula" },
    { campo: "Cpf/CnpjCliente1", descricao: "CPF/CNPJ do(s) Locatário(s), separados por vírgula" },
    { campo: "EstadoCivilCliente1", descricao: "Estado civil do primeiro Locatário da lista" },
    { campo: "ProficaoCliente1", descricao: "Profissão do primeiro Locatário da lista" },
    { campo: "EmailCliente1", descricao: "E-mail do primeiro Locatário da lista" },
    { campo: "TelefoneCliente1", descricao: "Telefone formatado do primeiro Locatário da lista" },
    { campo: "TipoImovel", descricao: "Tipo do imóvel" },
    { campo: "EnderecoImovel", descricao: "Endereço completo do imóvel" },
    { campo: "Inscricao", descricao: "Inscrição imobiliária formatada" },
    { campo: "Matricula", descricao: "Número de matrícula do imóvel" },
    { campo: "UcEnergisa", descricao: "Medidor de energia — vem da Administração vinculada, se houver" },
    { campo: "UcCaerd", descricao: "Medidor de água — vem da Administração vinculada, se houver" },
    { campo: "Observacao", descricao: "Observação da transação" },
    { campo: "TextoFinalidadeLocacao", descricao: "Residencial, Comercial ou Mista" },
    { campo: "PrazoContrato", descricao: "Tempo de contrato em meses" },
    { campo: "DataAssinatura", descricao: "Data de assinatura (dd/mm/aaaa)" },
    { campo: "DataVencimento", descricao: "Data de término do contrato (dd/mm/aaaa)" },
    { campo: "ValorTransacao", descricao: "Valor do aluguel em R$ (número)" },
    { campo: "DiaVencimento", descricao: "Dia do mês de vencimento do aluguel" },
    { campo: "FormaPagamento", descricao: "Pix ou Boleto" },
    { campo: "Encargos", descricao: "Lista de encargos por conta do locatário" },
    { campo: "Garantia", descricao: "Fiador, Caução, Seguro fiança ou Sem garantias" },
    { campo: "ValorCaucao", descricao: "Valor da caução em R$, se houver" },
    { campo: "PgCaucao", descricao: "Forma de pagamento da caução" },
    { campo: "Loja", descricao: "Porto Velho ou Jaru" },
    { campo: "DataAssinaturaExtenso", descricao: "Data de assinatura por extenso" },
    { campo: "IdTransacao", descricao: "Id da transação (id_legado, ex.: LOC-0004), usado no rodapé" },
    { campo: "IdAdmImovel", descricao: "Id da administração vinculada, se houver (usado no rodapé)" }
  ],
  // Vendedor(es) e Comprador(es) também podem ser mais de um — mesma lógica
  // de qualificação em JS (QualificacaoVendedor/QualificacaoComprador já
  // vêm com todos os nomes juntos, unidos por "e").
  contrato_compra_venda: [
    { campo: "QualificacaoVendedor", descricao: "Qualificação completa do(s) Vendedor(es)" },
    { campo: "QualificacaoComprador", descricao: "Qualificação completa do(s) Comprador(es)" },
    { campo: "TextoObjetoImovel", descricao: "Descrição do imóvel objeto da venda (endereço, matrícula, inscrição, descrição)" },
    { campo: "ValorTransacao", descricao: "Valor da venda em R$, número e por extenso" },
    { campo: "CondicoesPagamento", descricao: "Entrada, saldo, financiamento etc., um por linha" },
    { campo: "BancoVendedor", descricao: "Banco do primeiro Vendedor da lista" },
    { campo: "CodigoBancoVendedor", descricao: "Código do banco do primeiro Vendedor" },
    { campo: "AgenciaVendedor", descricao: "Agência do primeiro Vendedor" },
    { campo: "ContaVendedor", descricao: "Conta do primeiro Vendedor" },
    { campo: "TipoPixVendedor", descricao: "Tipo de chave PIX do primeiro Vendedor" },
    { campo: "PixVendedor", descricao: "Chave PIX do primeiro Vendedor" },
    { campo: "TextoHonorarios", descricao: "Dados bancários dos corretores para pagamento da comissão" },
    { campo: "Chave", descricao: "Momento de entrega das chaves" },
    { campo: "Loja", descricao: "Porto Velho ou Jaru" },
    { campo: "DataAssinaturaExtenso", descricao: "Data de assinatura por extenso" },
    { campo: "TextoAssinaturas", descricao: "Bloco de assinatura de todos os vendedores e compradores" },
    { campo: "TextoAssinaturasCorretores", descricao: "Bloco de assinatura dos corretores envolvidos" },
    { campo: "IdTransacao", descricao: "Id da transação (id_legado, ex.: CV-0004), usado no rodapé" }
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
    { campo: "DataAssinatura", descricao: "Data de assinatura por extenso, dia em 2 dígitos" },
    { campo: "IdAdmImovel", descricao: "Id da administração (id_legado, ex.: ADM-0004), usado no rodapé" }
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
  ],
  // Nasce do formulário "Elaboração de Contrato de Gestão" no portal do
  // corretor (app/portal/gestao/novo) — só o CONTRATANTE principal (primeiro
  // cliente cadastrado) aparece na qualificação do corpo do contrato;
  // AssinaturasAdicionais cobre o restante (herdeiros, cônjuges etc.) só no
  // bloco de assinatura, um por linha.
  contrato_gestao: [
    { campo: "NomeRazaoSocial", descricao: "Nome/razão social do cliente principal (aparece na qualificação e na assinatura)" },
    { campo: "RG", descricao: "RG do cliente principal" },
    { campo: "CpfCnpj", descricao: "CPF ou CNPJ do cliente principal" },
    { campo: "EnderecoCompleto", descricao: "Endereço completo do cliente principal" },
    { campo: "Nacionalidade", descricao: "Nacionalidade do cliente principal" },
    { campo: "EstadoCivil", descricao: "Estado civil do cliente principal" },
    { campo: "Email", descricao: "E-mail do cliente principal" },
    { campo: "TelefoneCelular", descricao: "Telefone celular do cliente principal" },
    { campo: "TelefoneReserva", descricao: "Telefone reserva do cliente principal, se houver" },
    { campo: "AssinaturasAdicionais", descricao: "Bloco de assinatura dos demais clientes cadastrados (um por linha), vazio se só houver um" },
    { campo: "TipoImovel", descricao: "Tipo do imóvel" },
    { campo: "Rua", descricao: "Rua do imóvel" },
    { campo: "Numero", descricao: "Número predial do imóvel" },
    { campo: "Complemento", descricao: "Complemento do endereço do imóvel" },
    { campo: "Bairro", descricao: "Bairro do imóvel" },
    { campo: "Cidade", descricao: "Cidade do imóvel (também usada no Foro e na data de fechamento)" },
    { campo: "Estado", descricao: "Estado do imóvel (também usado no Foro e na data de fechamento)" },
    { campo: "NumeroMatricula", descricao: "Número de matrícula do imóvel, se houver" },
    { campo: "InscricaoMunicipal", descricao: "Inscrição municipal/imobiliária do imóvel, se houver" },
    { campo: "ValorImovel", descricao: "Valor de venda pretendido em R$" },
    { campo: "PrazoGestao", descricao: "Prazo de exclusividade em dias" },
    { campo: "PorcentagemHonorarios", descricao: "Percentual de honorários combinado" },
    { campo: "DataFechamento", descricao: "Data de fechamento do contrato (dd/mm/aaaa)" },
    { campo: "Corretor", descricao: "Nome do corretor responsável (parceiro logado no portal)" },
    { campo: "CorretorCpf", descricao: "CPF do corretor responsável" },
    { campo: "Creci", descricao: "CRECI do corretor responsável" }
  ],
  // Nasce do formulário "Proposta de Compra e Venda" no portal do corretor
  // (app/portal/proposta/novo) — diferente do Contrato de Gestão, o imóvel
  // aqui NUNCA é cadastrado de verdade: é só texto livre, direto no merge do
  // documento, porque a proposta normalmente é sobre um imóvel externo (sem
  // proprietário na base). Cliente segue o mesmo padrão de reaproveitar
  // cadastro existente do corretor ou criar um novo.
  proposta_compra_venda: [
    { campo: "ParceiroCorretor", descricao: "Nome do corretor logado no portal que está fazendo a proposta" },
    { campo: "NomeRazaoSocial", descricao: "Nome/razão social do cliente (comprador/interessado)" },
    { campo: "CpfCnpj", descricao: "CPF ou CNPJ do cliente" },
    { campo: "EnderecoCompleto", descricao: "Endereço completo do cliente" },
    { campo: "EstadoCivil", descricao: "Estado civil do cliente" },
    { campo: "Descricao", descricao: "Descrição livre do imóvel (não cadastrado no sistema)" },
    { campo: "Rua", descricao: "Rua do imóvel (texto livre, não persistido)" },
    { campo: "Numero", descricao: "Número do imóvel (texto livre, não persistido)" },
    { campo: "Complemento", descricao: "Complemento do imóvel (texto livre, não persistido)" },
    { campo: "Bairro", descricao: "Bairro do imóvel (texto livre, não persistido)" },
    { campo: "Cidade", descricao: "Cidade do imóvel (texto livre, não persistido)" },
    { campo: "Estado", descricao: "Estado do imóvel (texto livre, não persistido)" },
    { campo: "ValorProposta", descricao: "Valor que o comprador pretende pagar, em R$ e por extenso" },
    { campo: "FormaPagamento", descricao: "Condições de pagamento propostas, uma por linha" },
    { campo: "DataFechamento", descricao: "Data da proposta (dd/mm/aaaa)" },
    { campo: "Creci", descricao: "CRECI do corretor responsável" }
  ]
};
