// Listas de opções usadas nos formulários de Clientes.
// Tipo de conta e tipo de PIX seguem as mesmas opções já usadas em Parceiros.
export { TIPOS_CONTA, TIPOS_PIX } from "@/lib/parceiros/opcoes";

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
