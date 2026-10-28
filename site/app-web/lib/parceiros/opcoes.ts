// Listas de opções usadas nos formulários de Parceiros — refletem os valores
// reais já existentes no banco (ver levantamento feito via SQL Editor).

// Funções que fazem parte da equipe interna da imobiliária (aparecem primeiro
// e em destaque na listagem de Parceiros).
export const FUNCOES_EQUIPE = ["Administrativo", "Corretor", "Corretor Estagiário"];

// Demais funções (parceiros externos, prestadores, desligados etc.).
export const FUNCOES_EXTERNAS = [
  "Corretor Externo",
  "Imobiliária Externa",
  "Parceiro Externa",
  "Prestador de Serviço",
  "Avaliador Bancário",
  "Desligado"
];

// Recrutados (28/10/2026): candidatos do recrutamento de corretores (leads de
// anúncio, indicações, redes sociais). Ficam logo abaixo de Corretor
// Estagiário na listagem e no seletor de função, mas NÃO são equipe: de
// propósito fora de FUNCOES_EQUIPE (sem acesso a portal, eventos internos
// nem conversão automática ao ficar Inativo) e fora dos seletores de
// corretor/parceiro dos demais módulos.
export const FUNCAO_RECRUTADOS = "Recrutados";
export const FUNCOES_RECRUTAMENTO = [FUNCAO_RECRUTADOS];

export const TODAS_FUNCOES = [...FUNCOES_EQUIPE, ...FUNCOES_RECRUTAMENTO, ...FUNCOES_EXTERNAS];

export const STATUS_FUNCAO = ["Ativo", "Inativo", "Excluído"];

// Valores em minúsculo de propósito — é exatamente como estão gravados no
// banco (import original da planilha). O <select> usa className="capitalize"
// para exibir com a primeira letra maiúscula sem alterar o valor salvo.
export const ESTADOS_CIVIS = [
  "solteiro (a)",
  "casado (a)",
  "divorciado (a)",
  "separado judicialmente (a)",
  "viúvo (a)",
  "em uma união estável"
];

// Mesma régua de lib/clientes/opcoes.ts (ver comentário lá), só que no
// vocabulário de Parceiros.
export const ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL = ["divorciado (a)", "separado judicialmente (a)", "solteiro (a)"];

export const TIPOS_CONTA = ["Conta corrente", "Conta poupança"];

export const TIPOS_PIX = ["CNPJ / CPF", "E-mail", "Telefone", "Chave aleatória"];

// Cor/etiqueta de destaque por função, para a listagem agrupada.
export function grupoDaFuncao(funcao: string): "equipe" | "externo" {
  return FUNCOES_EQUIPE.includes(funcao) ? "equipe" : "externo";
}
