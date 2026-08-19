"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, requireAdm, logAlteracao } from "@/lib/auth";
import { valorEditavelParaDecimal } from "@/lib/format";
import { registrarEJogarErro } from "@/lib/erros";
import { buscarClienteDuplicado } from "@/lib/clientes/duplicidade";
import { validarCpfCnpj } from "@/lib/clientes/validacao";
import { validarClienteZod } from "@/lib/clientes/schema";
import { montarEnderecoPF } from "@/lib/clientes/endereco";
import { gerarProximoIdCliente } from "@/lib/clientes/id-legado";
import { mensagemDeErro as mensagemDe, type ResultadoFormulario as ResultadoFormularioBase } from "@/lib/forms/resultado";

function texto(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

// Telefone é digitado com máscara ((xx) xxxxx-xxxx) mas gravado só com
// dígitos, no mesmo formato já usado no restante da base.
function telefoneDigitos(formData: FormData, campo: string): string | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = t.replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

// CPF/CNPJ são digitados com máscara mas gravados só com dígitos.
function digitos(formData: FormData, campo: string): string | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = t.replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

function rendaBruta(formData: FormData, campo: string): number | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  return valorEditavelParaDecimal(t);
}

function data(formData: FormData, campo: string): Date | null {
  const t = texto(formData, campo);
  if (t === null) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

// "" (não perguntado) vira NULL, "true"/"false" viram booleano de verdade —
// usado no campo uniao_estavel (só existe quando estado_civil pede).
function booleanoTri(formData: FormData, campo: string): boolean | null {
  const v = formData.get(campo);
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

// Endereço é sempre concatenado a partir dos campos divididos (CEP/rua/
// número/complemento/bairro/cidade/estado) — mesmo padrão de
// app/imoveis/actions.ts#montarEndereco. Vale tanto pra Pessoa Física
// ("Endereço") quanto Pessoa Jurídica ("Sede") — pedido do usuário
// (19/08/2026): "sede segue conforme o endereço de pessoa física, cep, rua,
// ... estado, cidade" — mesmo padrão estruturado pros dois tipos, não mais
// texto livre pra PJ.
//
// Quando nenhum campo do endereço dividido foi preenchido (ex.: cadastro
// antigo da planilha, PF ou PJ, aberto pra editar outra coisa sem mexer no
// endereço), devolve `undefined` — assim o Prisma não inclui `endereco` no
// update e o texto livre antigo (importado) continua intacto, em vez de
// ser apagado sem querer.
async function montarEnderecoCliente(formData: FormData): Promise<string | null | undefined> {
  const rua = texto(formData, "rua");
  const nPredial = texto(formData, "n_predial");
  const complemento = texto(formData, "complemento");
  const bairro = texto(formData, "bairro");
  const cidadeId = texto(formData, "cidade_id");
  const estadoId = texto(formData, "estado_id");

  if (!rua && !nPredial && !complemento && !bairro && !cidadeId && !estadoId) {
    return undefined;
  }

  return montarEnderecoPF({ rua, nPredial, complemento, bairro, cidadeId, estadoId });
}

async function camposEditaveis(formData: FormData) {
  const tipoCliente = texto(formData, "tipo_cliente");
  const ehPessoaFisica = tipoCliente !== "Pessoa Jurídica";

  return {
    tipo_cliente: tipoCliente ?? undefined,
    sexo: ehPessoaFisica ? texto(formData, "sexo") : null,
    cpf: digitos(formData, "cpf"),
    cnpj: digitos(formData, "cnpj"),
    rg: ehPessoaFisica ? texto(formData, "rg") : null,
    expedicao: ehPessoaFisica ? texto(formData, "expedicao") : null,
    telefone: telefoneDigitos(formData, "telefone"),
    email: texto(formData, "email"),
    estado_civil: ehPessoaFisica ? texto(formData, "estado_civil") : null,
    uniao_estavel: ehPessoaFisica ? booleanoTri(formData, "uniao_estavel") : null,
    nome_mae: ehPessoaFisica ? texto(formData, "nome_mae") : null,
    nome_pai: ehPessoaFisica ? texto(formData, "nome_pai") : null,
    renda_bruta: rendaBruta(formData, "renda_bruta"),
    data_nascimento: ehPessoaFisica ? data(formData, "data_nascimento") : null,
    cat_profissao: ehPessoaFisica ? texto(formData, "cat_profissao") : null,
    tipo_servidor: ehPessoaFisica ? texto(formData, "tipo_servidor") : null,
    profissao: ehPessoaFisica ? texto(formData, "profissao") : null,
    // Endereço estruturado (CEP/rua/número/complemento/bairro/estado/
    // cidade) vale pros dois tipos agora — PF usa como "Endereço", PJ como
    // "Sede", mesmo formato (19/08/2026, ver montarEnderecoCliente acima).
    cep: digitos(formData, "cep"),
    rua: texto(formData, "rua"),
    n_predial: texto(formData, "n_predial"),
    complemento: texto(formData, "complemento"),
    bairro: texto(formData, "bairro"),
    estado_id: texto(formData, "estado_id"),
    cidade_id: texto(formData, "cidade_id"),
    endereco: await montarEnderecoCliente(formData),
    observacao: texto(formData, "observacao"),
    parceiro_id: texto(formData, "parceiro_id"),
    loja_id: texto(formData, "loja_id"),
    banco_id: texto(formData, "banco_id"),
    codigo_banco: texto(formData, "codigo_banco"),
    agencia: texto(formData, "agencia"),
    conta: texto(formData, "conta"),
    tipo_conta: texto(formData, "tipo_conta"),
    tipo_pix: texto(formData, "tipo_pix"),
    pix: texto(formData, "pix"),
    updated_at: new Date()
  };
}

// Gold Standard de tratamento de erro (ver lib/forms/resultado.ts): em vez
// de `throw new Error(...)` (que derruba a página inteira pro error
// boundary e APAGA tudo que estava digitado — era a raiz do "toda vez
// perdemos cadastro"), a action devolve { erro } e o formulário mostra a
// mensagem inline, com os campos intactos. O registro no logs_erro continua
// igual: registrarEJogarErro grava ANTES de lançar, e aqui o catch só
// transforma o throw em retorno — nenhum erro deixa de ficar registrado.
// `duplicado: true` acompanha o erro quando o bloqueio foi a checagem de
// cliente repetido — o formulário usa isso pra mostrar a opção "criar mesmo
// assim" (só faz sentido nesse caso).
export type ResultadoFormulario = ResultadoFormularioBase<{ duplicado?: boolean }>;

// Checagem única dos campos que o usuário pediu pra alinhar em TODOS os
// pontos de cadastro de cliente do sistema (09/08/2026 — "Tipo de cliente,
// Nome, CPF, sexo e Telefone precisam ser obrigatórios em todos os
// formulários dos clientes"): admin (este arquivo), e os 6 formulários do
// portal do corretor (Gestão, Administração, Locação, Compra e Venda,
// Avaliação de CPF, Financiamento). Movida pra lib/clientes/validacao.ts —
// ver comentário lá do porquê (não pode ficar sync num arquivo "use server").

export async function criarClienteAction(_prev: unknown, formData: FormData): Promise<ResultadoFormulario> {
  await requireAdminSession();

  const nome = texto(formData, "nome");
  const tipoCliente = texto(formData, "tipo_cliente");

  // Validação via Zod (Gold Standard, 19/08/2026 — ver lib/clientes/schema.ts)
  // — mesmas regras de sempre (Tipo de cliente, Nome, CPF/CNPJ com dígito
  // verificador, Sexo obrigatório pra PF, Telefone e Loja), agora
  // centralizadas num schema único em vez de checagem manual campo a campo.
  const erroValidacao = validarClienteZod({
    tipoCliente,
    nome,
    cpf: texto(formData, "cpf"),
    cnpj: texto(formData, "cnpj"),
    sexo: texto(formData, "sexo"),
    telefone: texto(formData, "telefone"),
    lojaId: texto(formData, "loja_id")
  });
  if (erroValidacao) return { erro: erroValidacao };
  // Zod já garante que nome/tipo_cliente vieram preenchidos (schema exige
  // min(1)) — este if só existe pra o TypeScript enxergar `nome` e
  // `tipoCliente` como `string` dali pra baixo (mesmo narrowing que o guard
  // antigo fazia), na prática nunca deve disparar.
  if (!nome || !tipoCliente) {
    return { erro: "Nome e tipo de cliente são obrigatórios." };
  }

  // Mesma checagem de duplicidade que o portal do corretor já faz — o admin
  // era o único caminho que criava cliente sem conferir nada (e a auditoria
  // achou 19 CPFs e 27 nomes duplicados na base). Diferente do portal, aqui
  // o admin PODE decidir criar mesmo assim (homônimo de verdade): marcando o
  // checkbox "criar mesmo assim" que o formulário mostra junto do aviso.
  const criarMesmoAssim = formData.get("criar_mesmo_assim") === "on";
  if (!criarMesmoAssim) {
    const duplicado = await buscarClienteDuplicado({
      nome,
      cpfCnpj: texto(formData, "cpf") ?? texto(formData, "cnpj")
    });
    if (duplicado) {
      const dono = duplicado.parceiroNome ? ` (parceiro responsável: ${duplicado.parceiroNome})` : "";
      return {
        erro: `Já existe um cliente chamado "${duplicado.nome}"${dono} — confira se não é a mesma pessoa antes de cadastrar de novo.`,
        duplicado: true
      };
    }
  }

  // Sócios adicionados na própria tela de criação (ver cliente-form.tsx) —
  // valida o que dá pra validar sem ir ao banco antes de criar a PJ, pra não
  // deixar meio caminho andado se alguém digitou algo claramente errado.
  const sociosPendentes = tipoCliente === "Pessoa Jurídica" ? parseSociosPendentes(formData) : [];
  for (const entrada of sociosPendentes) {
    if (entrada.modo === "novo" && !entrada.nome) {
      return { erro: "Informe o nome de todos os sócios adicionados." };
    }
    if (entrada.modo === "novo" && entrada.cpf) {
      const erroCpf = validarCpfCnpj(entrada.cpf);
      if (erroCpf) return { erro: `Sócio "${entrada.nome}": ${erroCpf}` };
    }
  }

  let novoId: string;
  try {
    const novo = await prisma.clientes
      .create({
        data: {
          nome,
          id_legado: await gerarProximoIdCliente(),
          ...(await camposEditaveis(formData)),
          tipo_cliente: tipoCliente
        }
      })
      .catch((erro) => registrarEJogarErro({ entidadeTipo: "clientes", acao: "criar", erro }));

    await logAlteracao({
      entidadeTipo: "clientes",
      entidadeId: novo.id,
      acao: "criar",
      dadosDepois: { nome: novo.nome, tipo_cliente: novo.tipo_cliente }
    });
    novoId = novo.id;
  } catch (erro) {
    return { erro: mensagemDe(erro) };
  }

  if (sociosPendentes.length > 0) {
    await processarSociosPendentes(novoId, sociosPendentes);
  }

  revalidatePath("/clientes");
  redirect(`/clientes/${novoId}?salvo=1`);
}

export async function atualizarClienteAction(_prev: unknown, formData: FormData): Promise<ResultadoFormulario> {
  await requireAdminSession();

  const id = texto(formData, "clienteId");
  if (!id) return { erro: "Cliente inválido." };

  const antes = await prisma.clientes.findUnique({ where: { id } });
  if (!antes) return { erro: "Cliente não encontrado." };

  const tipoClienteEditado = texto(formData, "tipo_cliente");

  // Mesma validação via Zod aplicada na criação (ver lib/clientes/schema.ts)
  // — também vale pra edição, já que cadastros antigos importados sem esses
  // campos são justamente o problema que o usuário apontou ("sempre vem
  // faltando informações"). exigirLoja: false porque cadastro antigo sem
  // loja continua editável normalmente (mesma regra de sempre — só cadastro
  // NOVO exige loja).
  const erroValidacaoEditado = validarClienteZod({
    tipoCliente: tipoClienteEditado,
    nome: texto(formData, "nome") ?? antes.nome,
    cpf: texto(formData, "cpf"),
    cnpj: texto(formData, "cnpj"),
    sexo: texto(formData, "sexo"),
    telefone: texto(formData, "telefone"),
    lojaId: texto(formData, "loja_id"),
    exigirLoja: false
  });
  if (erroValidacaoEditado) return { erro: erroValidacaoEditado };

  try {
    const depois = await prisma.clientes
      .update({
        where: { id },
        data: await camposEditaveis(formData)
      })
      .catch((erro) => registrarEJogarErro({ entidadeTipo: "clientes", entidadeId: id, acao: "editar", erro }));

    await logAlteracao({
      entidadeTipo: "clientes",
      entidadeId: id,
      acao: "editar",
      dadosAntes: antes,
      dadosDepois: depois
    });
  } catch (erro) {
    return { erro: mensagemDe(erro) };
  }

  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
  // Ver mesmo comentário em app/imoveis/actions.ts: preserva ?embed=1 no
  // redirect quando salvo pelo painel lateral embutido num iframe.
  const embutido = texto(formData, "_embed") === "1";
  redirect(`/clientes/${id}?salvo=1${embutido ? "&embed=1" : ""}`);
}

// "Apagar" aqui é sempre um soft-delete: reaproveita o valor "Arquivado" já
// existente em status_cadastro (não precisou de coluna nova) — o cliente
// costuma ter histórico real vinculado (imóveis, transações, avaliações) e
// um DELETE de verdade quebraria essas referências. Só ADM pode fazer isso.
export async function apagarClienteAction(formData: FormData) {
  const admin = await requireAdm();

  const id = texto(formData, "clienteId");
  const voltarPara = id ? `/clientes/${id}` : "/clientes";

  try {
    if (!id) throw new Error("Cliente inválido.");

    const antes = await prisma.clientes.findUnique({ where: { id } });
    if (!antes) throw new Error("Cliente não encontrado.");

    await prisma.clientes
      .update({
        where: { id },
        data: { status_cadastro: "Arquivado", updated_at: new Date() }
      })
      .catch((erro) => registrarEJogarErro({ entidadeTipo: "clientes", entidadeId: id, acao: "excluir", erro }));

    await logAlteracao({
      entidadeTipo: "clientes",
      entidadeId: id,
      acao: "excluir",
      dadosAntes: { status_cadastro: antes.status_cadastro },
      dadosDepois: { status_cadastro: "Arquivado", excluido_por: admin.nome }
    });
  } catch (erro) {
    redirect(`${voltarPara}?erro=${encodeURIComponent(mensagemDe(erro))}`);
  }

  revalidatePath("/clientes");
  redirect("/clientes?excluido=1");
}

// --------------------------------------------------------------------
// Sócios de Pessoa Jurídica
//
// "Adicionar sócio" no cadastro de uma PJ não guarda só um nome solto: cria
// (ou reaproveita, se já existir pelo CPF) um cliente de verdade com
// tipo_cliente "Pessoa Física" — porque esse sócio pode um dia virar
// cliente PF nosso por conta própria, independente da empresa. Só depois
// grava o vínculo na tabela clientes_socios. `ordem` decide quem assina
// como representante legal da empresa nos contratos (o de ordem 0) — ver
// qualificacaoTexto/blocoAssinatura em lib/documentos/gerar.ts.
// --------------------------------------------------------------------

export type ResultadoSocio = { erro: string } | { ok: true } | undefined;

// Um "sócio digitado" pode vir de duas origens: o widget pós-criação
// (SocioForm, lê direto do FormData) ou a lista pendente montada no próprio
// formulário de criação da PJ (JSON serializado — ver socios_pendentes_json
// abaixo). As duas convergem pra este mesmo formato antes de resolver.
type SocioDigitado = {
  modo: "existente" | "novo";
  clienteId: string | null;
  nome: string | null;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
};

// Resolve o cliente Pessoa Física de um sócio: se "existente", só valida;
// se "novo", reaproveita por CPF (caso já seja nosso cliente por outro
// motivo) ou cria de verdade — nunca fica só com um nome solto, porque esse
// sócio pode um dia virar cliente PF nosso por conta própria.
async function resolverSocioClienteId(entrada: SocioDigitado): Promise<{ id: string } | { erro: string }> {
  if (entrada.modo === "existente") {
    if (!entrada.clienteId) return { erro: "Selecione o cliente que é sócio." };
    const socio = await prisma.clientes.findUnique({ where: { id: entrada.clienteId } });
    if (!socio) return { erro: "Cliente selecionado não encontrado." };
    if (socio.tipo_cliente !== "Pessoa Física") {
      return { erro: "O sócio precisa ser um cliente Pessoa Física." };
    }
    return { id: socio.id };
  }

  if (!entrada.nome) return { erro: "Informe o nome do sócio." };
  if (entrada.cpf) {
    const erroCpf = validarCpfCnpj(entrada.cpf);
    if (erroCpf) return { erro: erroCpf };
  }

  const cpfDigitos = entrada.cpf ? entrada.cpf.replace(/\D/g, "") : null;

  const existente = cpfDigitos
    ? await prisma.clientes.findFirst({ where: { cpf: cpfDigitos, tipo_cliente: "Pessoa Física" } })
    : null;
  if (existente) return { id: existente.id };

  const novo = await prisma.clientes
    .create({
      data: {
        nome: entrada.nome,
        tipo_cliente: "Pessoa Física",
        cpf: cpfDigitos,
        telefone: entrada.telefone?.replace(/\D/g, "") || null,
        email: entrada.email
      }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "clientes", acao: "criar_via_socio_pj", erro }));
  return { id: novo.id };
}

// Grava o vínculo em clientes_socios (se ainda não existir) — `ordem` decide
// quem assina como representante legal da empresa nos contratos (o de ordem
// 0). Usada tanto pelo widget pós-criação quanto pela criação em lote.
async function vincularSocio(pjClienteId: string, socioClienteId: string): Promise<{ erro: string } | { ok: true }> {
  const jaVinculado = await prisma.clientes_socios.findFirst({
    where: { pj_cliente_id: pjClienteId, socio_cliente_id: socioClienteId }
  });
  if (jaVinculado) return { erro: "Esse cliente já está vinculado como sócio dessa empresa." };

  const totalAtual = await prisma.clientes_socios.count({ where: { pj_cliente_id: pjClienteId } });

  await prisma.clientes_socios
    .create({
      data: { pj_cliente_id: pjClienteId, socio_cliente_id: socioClienteId, ordem: totalAtual }
    })
    .catch((erro) => registrarEJogarErro({ entidadeTipo: "clientes_socios", acao: "criar", erro }));

  await logAlteracao({
    entidadeTipo: "clientes",
    entidadeId: pjClienteId,
    acao: "adicionar_socio",
    dadosDepois: { socio_cliente_id: socioClienteId }
  });

  revalidatePath(`/clientes/${pjClienteId}`);
  return { ok: true };
}

export async function adicionarSocioAction(_prev: unknown, formData: FormData): Promise<ResultadoSocio> {
  await requireAdminSession();

  const pjClienteId = texto(formData, "pj_cliente_id");
  if (!pjClienteId) return { erro: "PJ inválida." };

  const pj = await prisma.clientes.findUnique({ where: { id: pjClienteId } });
  if (!pj || pj.tipo_cliente !== "Pessoa Jurídica") {
    return { erro: "Só é possível adicionar sócio a um cadastro de Pessoa Jurídica." };
  }

  const modo = texto(formData, "modo_socio") === "existente" ? "existente" : "novo";
  const resolvido = await resolverSocioClienteId({
    modo,
    clienteId: texto(formData, "socio_cliente_id"),
    nome: texto(formData, "socio_nome"),
    cpf: texto(formData, "socio_cpf"),
    telefone: texto(formData, "socio_telefone"),
    email: texto(formData, "socio_email")
  });
  if ("erro" in resolvido) return resolvido;

  return vincularSocio(pjClienteId, resolvido.id);
}

// Lista de sócios montada no próprio formulário de criação da PJ, antes de
// existir um id — vem como JSON no campo escondido socios_pendentes_json
// (ver componente cliente-form.tsx). Formato tolerante a lixo: qualquer
// entrada mal-formada é descartada em vez de derrubar a criação da PJ.
function parseSociosPendentes(formData: FormData): SocioDigitado[] {
  const bruto = texto(formData, "socios_pendentes_json");
  if (!bruto) return [];
  try {
    const lista = JSON.parse(bruto);
    if (!Array.isArray(lista)) return [];
    return lista
      .map((s): SocioDigitado | null => {
        if (!s || typeof s !== "object") return null;
        const modo = s.modo === "existente" ? "existente" : "novo";
        return {
          modo,
          clienteId: typeof s.clienteId === "string" && s.clienteId.trim() ? s.clienteId.trim() : null,
          nome: typeof s.nome === "string" && s.nome.trim() ? s.nome.trim() : null,
          cpf: typeof s.cpf === "string" && s.cpf.trim() ? s.cpf.trim() : null,
          telefone: typeof s.telefone === "string" && s.telefone.trim() ? s.telefone.trim() : null,
          email: typeof s.email === "string" && s.email.trim() ? s.email.trim() : null
        };
      })
      .filter((s): s is SocioDigitado => s !== null);
  } catch {
    return [];
  }
}

// Roda logo depois de criar a PJ — resolve (ou cria) cada sócio pendente e
// grava o vínculo, na mesma ordem em que foram adicionados na tela (ordem 0
// = representante legal). Erros pontuais (ex.: cliente selecionado some por
// alguma condição de corrida) não derrubam a criação da PJ, que já foi
// persistida — só ficam de fora e podem ser adicionados depois pelo widget
// de sócios existente na tela de edição.
async function processarSociosPendentes(pjClienteId: string, sociosPendentes: SocioDigitado[]): Promise<void> {
  for (const entrada of sociosPendentes) {
    const resolvido = await resolverSocioClienteId(entrada);
    if ("erro" in resolvido) continue;
    await vincularSocio(pjClienteId, resolvido.id);
  }
}

export async function removerSocioAction(formData: FormData) {
  await requireAdminSession();

  const vinculoId = texto(formData, "vinculo_id");
  const pjClienteId = texto(formData, "pj_cliente_id");
  const voltarPara = pjClienteId ? `/clientes/${pjClienteId}` : "/clientes";

  try {
    if (!vinculoId || !pjClienteId) throw new Error("Vínculo inválido.");

    await prisma.clientes_socios
      .delete({ where: { id: vinculoId } })
      .catch((erro) => registrarEJogarErro({ entidadeTipo: "clientes_socios", entidadeId: vinculoId, acao: "remover", erro }));

    await logAlteracao({
      entidadeTipo: "clientes",
      entidadeId: pjClienteId,
      acao: "remover_socio",
      dadosAntes: { vinculo_id: vinculoId }
    });
  } catch (erro) {
    redirect(`${voltarPara}?erro=${encodeURIComponent(mensagemDe(erro))}`);
  }

  revalidatePath(`/clientes/${pjClienteId}`);
}
