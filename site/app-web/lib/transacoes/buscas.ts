import { prisma } from "@/lib/prisma";
import { formatCpf, formatCnpj } from "@/lib/format";

// Buscas GLOBAIS (todos os corretores) usadas na Elaboração de Compra e
// Venda do portal — o corretor que está vendendo pode não ser o mesmo que
// captou o imóvel (contrato de gestão), e o comprador pode já estar
// cadastrado por outro corretor da imobiliária. Fora do próprio cadastro do
// corretor logado, os dados voltam REDIGIDOS: só o suficiente pra
// identificar/selecionar o registro certo, sem expor telefone/email/CPF de
// gente que não é cliente dele. Endereço de imóvel não é considerado dado
// sensível (não é contato de ninguém), então aparece sempre.

export type ImovelBuscaResultado = {
  id: string;
  id_legado: string | null;
  endereco: string | null;
  inscricao: string | null;
  parceiroId: string | null;
  deOutroCorretor: boolean;
  proprietarios: { id: string; nome: string }[];
  // Gestão (captação) mais recente já cadastrada pra esse imóvel, se houver
  // — dá pra já mostrar no formulário que a venda vai vincular automático,
  // sem precisar de outra ida ao servidor depois de escolher o imóvel.
  gestaoId: string | null;
};

// Lista completa (sem filtro de texto — a busca em si é feita no cliente,
// mesmo padrão do formulário de Transações do admin — components/transacao-form.tsx)
// pra não precisar de ida-e-volta ao servidor a cada letra digitada.
// SEM `take`: com um limite fixo, todo imóvel além do corte (ordem
// alfabética) sumia do seletor — inclusive um imóvel reatribuído pelo
// administrativo a outro corretor. São algumas centenas de linhas leves
// (id/endereço/inscrição), cabe tranquilo no payload da página.
export async function listarImoveisParaCompraVenda(parceiroIdAtual: string): Promise<ImovelBuscaResultado[]> {
  const imoveis = await prisma.imoveis.findMany({
    where: { excluido: false },
    orderBy: { endereco: "asc" },
    include: {
      imoveis_proprietarios: { include: { clientes: true }, orderBy: { ordem: "asc" } },
      gestoes: { where: { excluido: false }, orderBy: { created_at: "desc" }, take: 1, select: { id: true } }
    }
  });

  return imoveis.map((i) => ({
    id: i.id,
    id_legado: i.id_legado,
    endereco: i.endereco,
    inscricao: i.inscricao,
    parceiroId: i.parceiro_id,
    deOutroCorretor: i.parceiro_id !== parceiroIdAtual,
    proprietarios: i.imoveis_proprietarios.map((v) => ({ id: v.clientes.id, nome: v.clientes.nome })),
    gestaoId: i.gestoes[0]?.id ?? null
  }));
}

export type ClienteBuscaResultado = {
  id: string;
  nome: string;
  parceiroId: string | null;
  deOutroCorretor: boolean;
  // Ficam null quando o cliente não é deste corretor — só o nome aparece
  // pra escolher (o cadastro completo já existe, não precisa reaproveitar
  // os dados aqui).
  cpfCnpj: string | null;
  telefone: string | null;
  email: string | null;
};

export async function listarClientesParaCompraVenda(parceiroIdAtual: string): Promise<ClienteBuscaResultado[]> {
  // SEM `take`: tinha `take: 1000` e a base já passou de 1.100 clientes —
  // quem ficava depois do corte (ordem alfabética) simplesmente não
  // aparecia no seletor de "cliente já cadastrado", mesmo sendo cliente do
  // próprio corretor (caso real: cliente reatribuído pelo administrativo que
  // o corretor via em "Meus clientes" mas não conseguia escolher numa nova
  // avaliação/proposta). O payload é só nome + flags + contato redigido,
  // ~1 KB por cliente — carregar todos é barato e a busca continua no cliente.
  const clientes = await prisma.clientes.findMany({
    orderBy: { nome: "asc" }
  });

  return clientes.map((c) => {
    const deOutroCorretor = c.parceiro_id !== parceiroIdAtual;
    return {
      id: c.id,
      nome: c.nome,
      parceiroId: c.parceiro_id,
      deOutroCorretor,
      cpfCnpj: deOutroCorretor ? null : c.cpf ? formatCpf(c.cpf) : c.cnpj ? formatCnpj(c.cnpj) : null,
      telefone: deOutroCorretor ? null : c.telefone,
      email: deOutroCorretor ? null : c.email
    };
  });
}

// Busca ESCOPADA a um corretor específico — usada quando quem cadastra a
// transação escolhe explicitamente "qual corretor representa o
// comprador/locatário" (pedido do usuário em 06/08/2026: sempre quem
// cadastra é o corretor do vendedor/proprietário; do outro lado — comprador
// ou locatário — precisa dar pra escolher o corretor parceiro e puxar só os
// clientes dele). Diferente de listarClientesParaCompraVenda acima, aqui os
// dados vêm SEMPRE completos (sem redigir cpf/telefone/email): é uma escolha
// deliberada e específica de um corretor, não uma listagem geral aberta pra
// qualquer um — não faz sentido esconder o contato depois de já ter
// escolhido explicitamente de quem são os clientes.
export async function buscarClientesPorParceiro(parceiroId: string): Promise<ClienteBuscaResultado[]> {
  const clientes = await prisma.clientes.findMany({
    where: { parceiro_id: parceiroId },
    orderBy: { nome: "asc" },
    take: 1000
  });

  return clientes.map((c) => ({
    id: c.id,
    nome: c.nome,
    parceiroId: c.parceiro_id,
    deOutroCorretor: false,
    cpfCnpj: c.cpf ? formatCpf(c.cpf) : c.cnpj ? formatCnpj(c.cnpj) : null,
    telefone: c.telefone,
    email: c.email
  }));
}

// Gestão (captação) já cadastrada pra esse imóvel, se houver — usada pra
// auto-vincular a transação de Compra e Venda a ela (gestao_id) e criar uma
// atividade no quadro dela, sem mexer na coluna/Kanban (isso continua manual,
// o ADM decide quando mover). Se tiver mais de uma (não deveria, mas por via
// das dúvidas), pega a mais recente.
export async function buscarGestaoPorImovel(imovelId: string) {
  return prisma.gestoes.findFirst({
    where: { imovel_id: imovelId, excluido: false },
    orderBy: { created_at: "desc" }
  });
}
