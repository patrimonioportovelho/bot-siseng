import { z } from "zod";
import { cpfValido, cnpjValido } from "./validacao";

// Schema Zod do cadastro de Cliente — Gold Standard do sistema (19/08/2026,
// pedido do usuário: "Garanta que o formulário de Clientes use validação
// via Zod Schema"). Espelha EXATAMENTE as mesmas regras que já existiam em
// validarClienteObrigatorio + validarCpfCnpj (lib/clientes/validacao.ts) —
// não é validação nova, é a mesma regra reescrita via Zod, centralizada
// aqui. Aquelas duas funções continuam existindo e sendo usadas pelos
// outros pontos de cadastro de cliente do sistema (os 6 fluxos do portal do
// corretor, Parceiros) — este schema é específico do formulário de
// Clientes do admin (app/clientes/actions.ts), que é o Gold Standard.
//
// Recebe os campos já extraídos do FormData (string | null) — quem chama
// continua lendo o FormData com os helpers texto()/digitos() de sempre.
const campoOpcional = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v ?? "").trim() || null);

export const clienteFormSchema = z
  .object({
    tipo_cliente: z.string().trim().min(1, "Tipo de cliente é obrigatório."),
    nome: z.string().trim().min(1, "Nome é obrigatório."),
    cpf: campoOpcional,
    cnpj: campoOpcional,
    sexo: campoOpcional,
    telefone: z.string().trim().min(1, "Telefone é obrigatório."),
    // Loja é obrigatória só na CRIAÇÃO (pedido do usuário, 01/08/2026) — na
    // edição um cadastro antigo sem loja continua editável normalmente (ver
    // exigirLoja em validarClienteZod), então fica opcional aqui no schema
    // e a obrigatoriedade é aplicada condicionalmente por quem chama.
    loja_id: campoOpcional,
    email: campoOpcional
  })
  .superRefine((dados, ctx) => {
    if (dados.tipo_cliente === "Pessoa Jurídica") {
      if (!dados.cnpj) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cnpj"], message: "CNPJ é obrigatório." });
      } else if (!cnpjValido(dados.cnpj)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cnpj"],
          message: "CNPJ inválido — confira os números digitados."
        });
      }
    } else {
      if (!dados.cpf) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cpf"], message: "CPF é obrigatório." });
      } else if (!cpfValido(dados.cpf)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cpf"],
          message: "CPF inválido — confira os números digitados."
        });
      }
      if (!dados.sexo) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sexo"], message: "Sexo é obrigatório." });
      }
    }
  });

export type ClienteFormEntrada = z.infer<typeof clienteFormSchema>;

// Roda o schema e devolve só a PRIMEIRA mensagem de erro — encaixa direto
// no formato { erro: string } do ResultadoFormulario (Gold Standard, ver
// lib/forms/resultado.ts), sem mudar como o formulário mostra erro hoje.
export function validarClienteZod(input: {
  tipoCliente: string | null;
  nome: string | null;
  cpf: string | null;
  cnpj: string | null;
  sexo: string | null;
  telefone: string | null;
  lojaId: string | null;
  email?: string | null;
  // false na edição (cadastro antigo sem loja continua editável — mesma
  // regra de sempre, ver comentário em app/clientes/actions.ts); true (ou
  // omitido) na criação de cliente novo.
  exigirLoja?: boolean;
}): string | null {
  const resultado = clienteFormSchema.safeParse({
    tipo_cliente: input.tipoCliente ?? "",
    nome: input.nome ?? "",
    cpf: input.cpf,
    cnpj: input.cnpj,
    sexo: input.sexo,
    telefone: input.telefone ?? "",
    loja_id: input.lojaId,
    email: input.email ?? null
  });
  if (!resultado.success) return resultado.error.issues[0]?.message ?? "Dados inválidos — confira o formulário.";
  if ((input.exigirLoja ?? true) && !resultado.data.loja_id) return "Loja é obrigatória.";
  return null;
}
