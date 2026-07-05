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
