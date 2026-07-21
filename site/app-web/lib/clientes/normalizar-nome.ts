// Padroniza a capitalização de nome de pessoa física — ex.: "JOTA SILVESTRE
// DO NASCIMENTO SILVA", "jota silvestre do nascimento silva" ou qualquer
// mistura de maiúsculo/minúsculo digitada errado viram sempre
// "Jota Silvestre do Nascimento Silva": cada palavra com inicial maiúscula,
// exceto os conectores comuns de nome brasileiro (de, da, do, das, dos, e),
// que ficam em minúsculo quando não são a primeira palavra do nome.
//
// Usado pelo Prisma Client extension em lib/prisma.ts, que aplica isso
// automaticamente em todo prisma.clientes.create/update que tiver "nome" no
// payload — não precisa (nem deve) ser chamado à mão nas Server Actions.
//
// Não é aplicado a Pessoa Jurídica (razão social) — nome de empresa costuma
// ter sigla que não pode virar minúscula (LTDA, ME, EPP, S/A, EIRELI etc.),
// e "capitalizar" isso do jeito de nome de pessoa quebraria o nome oficial.

const CONECTORES = new Set(["de", "da", "do", "das", "dos", "e"]);

function capitalizarPalavra(palavra: string): string {
  // Preserva hífen e apóstrofo capitalizando cada pedaço separado por eles
  // (ex.: "maria-clara" -> "Maria-Clara", "d'ávila" -> "D'Ávila").
  return palavra
    .split(/([-'])/)
    .map((parte) => {
      if (parte === "-" || parte === "'" || parte === "") return parte;
      return parte.charAt(0).toLocaleUpperCase("pt-BR") + parte.slice(1).toLocaleLowerCase("pt-BR");
    })
    .join("");
}

export function normalizarNomeProprio(nomeBruto: string): string {
  const nome = nomeBruto.trim().replace(/\s+/g, " ");
  if (!nome) return nome;

  return nome
    .split(" ")
    .map((palavra, indice) => {
      const minuscula = palavra.toLocaleLowerCase("pt-BR");
      if (indice > 0 && CONECTORES.has(minuscula)) return minuscula;
      return capitalizarPalavra(palavra);
    })
    .join(" ");
}
