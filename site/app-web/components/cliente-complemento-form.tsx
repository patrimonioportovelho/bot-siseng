"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ESTADOS_CIVIS,
  ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL,
  TIPOS_CONTA,
  TIPOS_PIX,
  TIPOS_CLIENTE,
  SEXO_OPCOES,
  CAT_PROFISSAO_OPCOES
} from "@/lib/clientes/opcoes";
import { buscarCep, UF_PARA_ESTADO } from "@/lib/enderecos";
import { formatCnpj, formatCpf, formatTelefone } from "@/lib/format";
import { camposFaltandoCredito, type ClienteAvaliacao } from "@/lib/financiamento/avaliacao-credito";

type Listas = {
  bancos: { id: string; nome: string; codigo: string | null }[];
  estados: { id: string; nome: string }[];
  cidades: { id: string; nome: string; estado_id: string }[];
};

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-[11px] text-gray-600 block mb-0.5";
const GRADE = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-3 gap-y-2.5";

// "Complementar dados" na etiqueta do corretor: a única coisa que ele edita no cliente. O lead que vai
// virar contrato precisa do cadastro completo; o quadro de pendências mostra o que ainda falta.
export function ClienteComplementoForm({
  clienteInicial,
  carregarListas,
  salvar
}: {
  clienteInicial: ClienteAvaliacao;
  carregarListas: () => Promise<Listas>;
  salvar: (clienteId: string, c: ClienteAvaliacao) => Promise<{ ok: true } | { ok: false; erro: string }>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [cliente, setCliente] = useState(clienteInicial);
  const [listas, setListas] = useState<Listas | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const faltando = camposFaltandoCredito(cliente);
  const mostrarCpf = cliente.tipoCliente !== "Pessoa Jurídica";
  const mostrarCnpj = cliente.tipoCliente !== "Pessoa Física";

  async function abrir() {
    setAberto(true);
    if (!listas) setListas(await carregarListas());
  }

  function atualizar<K extends keyof ClienteAvaliacao>(campo: K, valor: ClienteAvaliacao[K]) {
    setCliente((atual) => ({ ...atual, [campo]: valor }));
  }

  async function buscarEnderecoPorCep() {
    if (!listas) return;
    const encontrado = await buscarCep(cliente.cep);
    if (!encontrado) return;
    const nomeEstado = UF_PARA_ESTADO[encontrado.uf] ?? "";
    const estado = listas.estados.find((e) => e.nome.toLowerCase() === nomeEstado.toLowerCase());
    const cidade = estado ? listas.cidades.find((c) => c.estado_id === estado.id && c.nome.toLowerCase() === encontrado.localidade.toLowerCase()) : undefined;
    setCliente((atual) => ({
      ...atual,
      rua: encontrado.logradouro || atual.rua,
      bairro: encontrado.bairro || atual.bairro,
      estadoId: estado?.id ?? atual.estadoId,
      cidadeId: cidade?.id ?? ""
    }));
  }

  async function enviar() {
    setSalvando(true);
    setAviso(null);
    const r = await salvar(clienteInicial.clienteId as string, cliente).catch(() => ({ ok: false as const, erro: "Não foi possível salvar agora." }));
    setSalvando(false);
    if (r.ok) {
      setAviso({ tipo: "ok", texto: "Dados salvos. O administrativo vê o que você complementou." });
      startTransition(() => router.refresh());
    } else setAviso({ tipo: "erro", texto: r.erro });
  }

  const campo = (id: keyof ClienteAvaliacao, rotulo: string, opcoes: { tipo?: string; placeholder?: string; aoSair?: (v: string) => void } = {}) => (
    <div>
      <label className={LABEL} htmlFor={`cp-${id}`}>
        {rotulo}
      </label>
      <input
        id={`cp-${id}`}
        type={opcoes.tipo ?? "text"}
        placeholder={opcoes.placeholder}
        className={CAMPO}
        value={String(cliente[id] ?? "")}
        onChange={(e) => atualizar(id, e.target.value as never)}
        onBlur={(e) => opcoes.aoSair?.(e.target.value)}
      />
    </div>
  );
  const seletor = (id: keyof ClienteAvaliacao, rotulo: string, itens: { valor: string; texto: string }[], aoMudar?: (v: string) => void) => (
    <div>
      <label className={LABEL} htmlFor={`cp-${id}`}>
        {rotulo}
      </label>
      <select id={`cp-${id}`} className={CAMPO} value={String(cliente[id] ?? "")} onChange={(e) => (aoMudar ? aoMudar(e.target.value) : atualizar(id, e.target.value as never))}>
        <option value="">—</option>
        {itens.map((i) => (
          <option key={i.valor} value={i.valor}>
            {i.texto}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="text-sm font-bold text-gray-800">Complementar dados do cliente</div>
          <div className={`text-[11px] mt-0.5 ${faltando.length === 0 ? "text-green-700" : "text-amber-700"}`}>
            {faltando.length === 0 ? "Cadastro completo para contrato." : `Para virar contrato faltam ${faltando.length} dado${faltando.length === 1 ? "" : "s"}: ${faltando.join(", ")}.`}
          </div>
        </div>
        {!aberto && (
          <button type="button" onClick={() => void abrir()} className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold hover:opacity-90">
            {faltando.length === 0 ? "Ver e editar dados" : "Completar agora"}
          </button>
        )}
      </div>

      {aberto && !listas && <div className="text-xs text-gray-400 mt-3">Carregando...</div>}
      {aberto && listas && (
        <div className="mt-4 flex flex-col gap-5">
          <section>
            <div className="text-[11px] font-semibold text-gray-500 mb-2">Identificação</div>
            <div className={GRADE}>
              {campo("nome", mostrarCpf ? "Nome completo" : "Razão social")}
              {seletor("tipoCliente", "Tipo de cliente", TIPOS_CLIENTE.map((t) => ({ valor: t, texto: t })))}
              {mostrarCpf && campo("cpf", "CPF", { placeholder: "000.000.000-00", aoSair: (v) => atualizar("cpf", formatCpf(v)) })}
              {mostrarCnpj && campo("cnpj", "CNPJ", { placeholder: "00.000.000/0000-00", aoSair: (v) => atualizar("cnpj", formatCnpj(v)) })}
              {mostrarCpf && (
                <>
                  {campo("rg", "RG")}
                  {campo("expedicao", "Estado de expedição")}
                  {seletor("sexo", "Sexo", SEXO_OPCOES.map((s) => ({ valor: s, texto: s })))}
                  {campo("dataNascimento", "Data de nascimento", { tipo: "date" })}
                  {campo("nomeMae", "Nome da mãe")}
                  {campo("nomePai", "Nome do pai")}
                  {seletor("estadoCivil", "Estado civil", ESTADOS_CIVIS.map((t) => ({ valor: t, texto: t })), (v) => {
                    atualizar("estadoCivil", v);
                    if (!ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL.includes(v)) atualizar("uniaoEstavel", "");
                  })}
                  {ESTADOS_CIVIS_PEDE_UNIAO_ESTAVEL.includes(cliente.estadoCivil) &&
                    seletor("uniaoEstavel", "Convive em união estável?", [
                      { valor: "false", texto: "Não" },
                      { valor: "true", texto: "Sim" }
                    ])}
                </>
              )}
            </div>
          </section>

          <section>
            <div className="text-[11px] font-semibold text-gray-500 mb-2">Contato e endereço</div>
            <div className={GRADE}>
              {campo("telefone", "Telefone", { placeholder: "(69) 99999-9999", aoSair: (v) => atualizar("telefone", formatTelefone(v)) })}
              {campo("email", "E-mail", { tipo: "email" })}
              {campo("cep", "CEP", { placeholder: "00000-000", aoSair: () => void buscarEnderecoPorCep() })}
              {campo("rua", "Logradouro")}
              {campo("nPredial", "Número predial")}
              {campo("complemento", "Complemento")}
              {campo("bairro", "Bairro")}
              {seletor("estadoId", "Estado", listas.estados.map((e) => ({ valor: e.id, texto: e.nome })), (v) => {
                atualizar("estadoId", v);
                atualizar("cidadeId", "");
              })}
              {seletor("cidadeId", "Cidade", listas.cidades.filter((c) => c.estado_id === cliente.estadoId).map((c) => ({ valor: c.id, texto: c.nome })))}
            </div>
          </section>

          <section>
            <div className="text-[11px] font-semibold text-gray-500 mb-2">Profissional e renda</div>
            <div className={GRADE}>
              {campo("profissao", "Profissão")}
              {seletor("catProfissao", "Categoria de profissão", CAT_PROFISSAO_OPCOES.map((t) => ({ valor: t, texto: t })))}
              {campo("tipoServidor", "Tipo de servidor")}
              {campo("rendaBruta", "Renda bruta (R$)", { placeholder: "2.500,00" })}
            </div>
          </section>

          <section>
            <div className="text-[11px] font-semibold text-gray-500 mb-2">Dados bancários</div>
            <div className={GRADE}>
              {seletor("bancoId", "Banco", listas.bancos.map((b) => ({ valor: b.id, texto: b.nome })), (v) => {
                const banco = listas.bancos.find((b) => b.id === v);
                setCliente((atual) => ({ ...atual, bancoId: v, codigoBanco: banco?.codigo ?? atual.codigoBanco }));
              })}
              {campo("codigoBanco", "Código do banco")}
              {campo("agencia", "Agência")}
              {campo("conta", "Conta")}
              {seletor("tipoConta", "Tipo de conta", TIPOS_CONTA.map((t) => ({ valor: t, texto: t })))}
              {seletor("tipoPix", "Tipo de PIX", TIPOS_PIX.map((t) => ({ valor: t, texto: t })))}
              {campo("pix", "Chave PIX")}
            </div>
          </section>

          <section>
            <label className={LABEL} htmlFor="cp-observacao">
              Observação
            </label>
            <textarea id="cp-observacao" className={`${CAMPO} min-h-16`} value={cliente.observacao} onChange={(e) => atualizar("observacao", e.target.value)} />
          </section>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => void enviar()}
              disabled={salvando}
              className="bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-60 hover:opacity-90"
            >
              {salvando ? "Salvando..." : "Salvar dados"}
            </button>
            <button type="button" onClick={() => setAberto(false)} className="text-xs text-gray-500 hover:text-gray-800">
              Fechar
            </button>
            {aviso && <span className={`text-xs ${aviso.tipo === "ok" ? "text-green-700" : "text-red-600"}`}>{aviso.texto}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
