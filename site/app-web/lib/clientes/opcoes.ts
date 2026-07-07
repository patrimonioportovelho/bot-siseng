// Listas de opções usadas nos formulários de Clientes.
//
// Tipo de conta TAMBÉM não pode reaproveitar o TIPOS_CONTA de Parceiros: o
// check constraint de clientes (clientes_tipo_conta_check) aceita mais um
// valor ("Conta salário") que o de parceiros não tem — não chega a dar erro
// de salvar (é só um valor a menos disponível pra escolher), mas o correto é
// cada tabela ter sua própria lista batendo com o constraint dela.
export const TIPOS_CONTA = ["Conta corrente", "Conta poupança", "Conta salário"];

// Tipo de PIX NÃO pode reaproveitar o TIPOS_PIX de Parceiros aqui: o check
// constraint de clientes (clientes_tipo_pix_check) espera "CPF / CNPJ",
// enquanto o de parceiros (parceiros_tipo_pix_check) espera "CNPJ / CPF" —
// ordem invertida entre as duas tabelas. Usar a lista errada aqui derrubava
// o salvamento (create E update) com erro de constraint do Postgres sempre
// que Tipo de PIX = CPF/CNPJ era escolhido no cadastro de Cliente.
export const TIPOS_PIX = ["CPF / CNPJ", "E-mail", "Telefone", "Chave aleatória"];

// Estado civil de Clientes usa um domínio de valores diferente do de
// Parceiros (aqui em TitleCase e sem sufixo "(a)").
export const ESTADOS_CIVIS = [
  "Casado",
  "Divorciado",
  "Separado Judicialmente",
  "Solteiro",
  "União Estável",
  "Viúvo"
];

export const TIPOS_CLIENTE = ["Pessoa Física", "Pessoa Jurídica"];

// Valores exatos aceitos pelo check constraint clientes_sexo_check no banco
// (só "Homem" ou "Mulher", NULL também é aceito). Antes esse campo era texto
// livre no formulário — qualquer valor digitado fora dessa lista (ex.: "F",
// "Feminino") derrubava o salvamento com um erro de constraint do Postgres.
export const SEXO_OPCOES = ["Homem", "Mulher"];

// Valores exatos aceitos pelo check constraint clientes_cat_profissao_check.
// Mesmo problema do Sexo: "Categoria de profissão" era texto livre no
// formulário, então qualquer valor fora dessa lista (ex.: "Aposentado",
// "Estudante") derrubava o salvamento com um erro de constraint do Postgres —
// provavelmente a causa dos erros intermitentes no cadastro de cliente.
export const CAT_PROFISSAO_OPCOES = [
  "Serviço público - Cargo Comissionado (CDS)",
  "Serviço público - Estatutário",
  "Autônomo",
  "Empresário",
  "Funcionário de empresa privada"
];
