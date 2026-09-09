import { prisma } from "@/lib/prisma";

export type ClienteDuplicado = {
  id: string;
  nome: string;
  parceiroId: string | null;
  parceiroNome: string | null;
};

// Normaliza um nome pra comparação: tira acento, baixa pra minúsculo, colapsa
// espaços e remove pontuação. "José  Sodrè" e "Jose Sodre" passam a ser
// iguais — o `equals`/`insensitive` do Prisma sozinho NÃO pega isso e foi
// assim que entraram duplicados tipo "Arthur ... Sodre" / "Arthur ... Sodrè"
// com corretores diferentes.
export function normalizarNome(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // tira marcas de acento combinantes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Verifica se já existe, em QUALQUER corretor, um cliente cadastrado com o
// mesmo nome (comparação sem acento/maiúsculas/pontuação — ver normalizarNome)
// ou o mesmo CPF/CNPJ do que está sendo digitado agora num formulário.
//
// Motivo: nos formulários do portal, a lista de "cliente já cadastrado" só
// mostra os clientes do PRÓPRIO corretor (Compra e Venda/Locação do lado do
// comprador/locatário) — de propósito, pra não vazar cadastro de cliente de
// outro corretor. Se o corretor A já cadastrou "João da Silva" e o corretor B
// também atende o mesmo João sem saber, B não vê o cadastro do A e digitaria
// tudo de novo, criando um duplicado. Esta função pega esse caso antes de
// criar: se achar duplicata, quem chama bloqueia (ou, no admin, deixa criar
// mesmo assim marcando "homônimo de verdade").
export async function buscarClienteDuplicado(params: {
  nome: string;
  cpfCnpj?: string | null;
  ignorarIds?: string[];
}): Promise<ClienteDuplicado | null> {
  const nomeNorm = normalizarNome(params.nome ?? "");
  const doc = params.cpfCnpj ? params.cpfCnpj.replace(/\D/g, "") : "";
  if (!nomeNorm && !doc) return null;

  const ignorar = new Set(params.ignorarIds ?? []);

  // CPF/CNPJ é comparação exata de dígitos — dá pra filtrar no banco.
  if (doc) {
    const porDoc = await prisma.clientes.findFirst({
      where: {
        OR: [{ cpf: doc }, { cnpj: doc }],
        ...(ignorar.size > 0 ? { id: { notIn: [...ignorar] } } : {})
      },
      include: { parceiros: { select: { id: true, nome: true } } },
      orderBy: { created_at: "asc" }
    });
    if (porDoc) {
      return {
        id: porDoc.id,
        nome: porDoc.nome,
        parceiroId: porDoc.parceiros?.id ?? porDoc.parceiro_id ?? null,
        parceiroNome: porDoc.parceiros?.nome ?? null
      };
    }
  }

  // Nome só dá pra comparar normalizado, e o Postgres aqui não tem a extensão
  // `unaccent` ligada — então varre a base (é pequena, ~1k linhas leves) e
  // compara em memória. Roda só no submit de um cadastro, não é hot path.
  if (nomeNorm) {
    const candidatos = await prisma.clientes.findMany({
      select: { id: true, nome: true, parceiro_id: true, parceiros: { select: { nome: true } }, created_at: true },
      orderBy: { created_at: "asc" }
    });
    const achado = candidatos.find((c) => !ignorar.has(c.id) && normalizarNome(c.nome) === nomeNorm);
    if (achado) {
      return {
        id: achado.id,
        nome: achado.nome,
        parceiroId: achado.parceiro_id ?? null,
        parceiroNome: achado.parceiros?.nome ?? null
      };
    }
  }

  return null;
}

// Mensagem padrão de bloqueio, reaproveitada nos formulários do portal.
// `parceiroIdAtual`: se informado e o duplicado já for do próprio corretor, a
// mensagem muda — não faz sentido mandar "avise o administrativo" pra um
// cliente que já está no nome dele (é só escolher na busca).
export function mensagemClienteDuplicado(d: ClienteDuplicado, parceiroIdAtual?: string): string {
  if (parceiroIdAtual && d.parceiroId === parceiroIdAtual) {
    return `Você já tem um cliente chamado "${d.nome}" cadastrado. Use o campo "buscar cliente já cadastrado" acima para selecioná-lo em vez de cadastrar de novo.`;
  }
  const dono = d.parceiroNome ? ` (cadastrado no nome de ${d.parceiroNome})` : "";
  return `Já existe um cliente chamado "${d.nome}"${dono} no banco de dados. Não é possível cadastrar de novo — avise o administrativo para transferir o cliente para o seu nome, se for o caso.`;
}
