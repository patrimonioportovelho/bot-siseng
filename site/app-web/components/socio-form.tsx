"use client";

import { useActionState, useMemo, useState } from "react";
import { formatCpf, formatTelefone } from "@/lib/format";

type ClientePF = { id: string; nome: string; cpf: string | null };
type SocioVinculado = { vinculoId: string; id: string; nome: string; cpf: string | null };

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

// Widget de sócios no cadastro de Pessoa Jurídica. Só aparece depois que a
// PJ já existe (precisa do id pra gravar o vínculo em clientes_socios).
// "Adicionar sócio" nunca guarda só um nome solto — sempre cria (ou
// reaproveita, se já existir pelo CPF) um cliente de verdade em Pessoa
// Física, porque esse sócio pode um dia virar cliente PF nosso por conta
// própria. O primeiro da lista (ordem 0) é quem assina como representante
// legal da empresa nos contratos.
export function SocioForm({
  pjClienteId,
  sociosAtuais,
  clientesPfDisponiveis,
  adicionarAction,
  removerAction
}: {
  pjClienteId: string;
  sociosAtuais: SocioVinculado[];
  clientesPfDisponiveis: ClientePF[];
  adicionarAction: (prevState: unknown, formData: FormData) => Promise<{ erro: string } | { ok: true } | undefined>;
  removerAction: (formData: FormData) => Promise<void>;
}) {
  const [resultado, formAction] = useActionState(adicionarAction, undefined);
  const [modo, setModo] = useState<"existente" | "novo">("existente");
  const [busca, setBusca] = useState("");
  const [listaAberta, setListaAberta] = useState(false);
  const [selecionado, setSelecionado] = useState<ClientePF | null>(null);

  const jaVinculadosIds = useMemo(() => new Set(sociosAtuais.map((s) => s.id)), [sociosAtuais]);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const disponiveis = clientesPfDisponiveis.filter((c) => !jaVinculadosIds.has(c.id));
    if (!t) return disponiveis.slice(0, 30);
    return disponiveis.filter((c) => c.nome.toLowerCase().includes(t)).slice(0, 30);
  }, [busca, clientesPfDisponiveis, jaVinculadosIds]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="text-sm font-bold text-gray-800 mb-3">Sócios</div>

      {sociosAtuais.length > 0 ? (
        <div className="flex flex-col gap-1 mb-4">
          {sociosAtuais.map((s, i) => (
            <div
              key={s.vinculoId}
              className="flex items-center justify-between text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5"
            >
              <span className="text-gray-700">
                {i === 0 && <span className="text-[10px] uppercase text-primary font-bold mr-1">Rep. legal</span>}
                <a href={`/clientes/${s.id}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                  {s.nome}
                </a>
                {s.cpf && <span className="text-gray-400"> — {formatCpf(s.cpf)}</span>}
              </span>
              <form action={removerAction}>
                <input type="hidden" name="vinculo_id" value={s.vinculoId} />
                <input type="hidden" name="pj_cliente_id" value={pjClienteId} />
                <button type="submit" className="text-gray-400 hover:text-red-600">
                  remover
                </button>
              </form>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 mb-4">Nenhum sócio cadastrado ainda.</p>
      )}

      <form action={formAction} className="border-t border-gray-100 pt-3 flex flex-col gap-2">
        <input type="hidden" name="pj_cliente_id" value={pjClienteId} />
        <input type="hidden" name="modo_socio" value={modo} />

        <div className="flex gap-3 text-xs mb-1">
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="radio"
              checked={modo === "existente"}
              onChange={() => setModo("existente")}
            />
            Cliente já cadastrado
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="radio" checked={modo === "novo"} onChange={() => setModo("novo")} />
            Cadastrar novo
          </label>
        </div>

        {modo === "existente" ? (
          <div className="relative">
            {selecionado && <input type="hidden" name="socio_cliente_id" value={selecionado.id} />}
            <input
              className={CAMPO}
              placeholder="Digite para buscar cliente Pessoa Física..."
              value={selecionado ? selecionado.nome : busca}
              onChange={(e) => {
                setSelecionado(null);
                setBusca(e.target.value);
                setListaAberta(true);
              }}
              onFocus={() => setListaAberta(true)}
              onBlur={() => setTimeout(() => setListaAberta(false), 150)}
            />
            {listaAberta && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg max-h-48 overflow-auto shadow-lg">
                {filtrados.length === 0 && <p className="text-xs text-gray-400 p-3">Nenhum cliente encontrado.</p>}
                {filtrados.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => {
                      setSelecionado(c);
                      setListaAberta(false);
                    }}
                    className="block w-full text-left text-xs px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-gray-700"
                  >
                    {c.nome}
                    {c.cpf ? ` — ${formatCpf(c.cpf)}` : ""}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-2">
            <div>
              <label className={LABEL}>Nome completo</label>
              <input className={CAMPO} name="socio_nome" required />
            </div>
            <div>
              <label className={LABEL}>CPF</label>
              <input className={CAMPO} name="socio_cpf" placeholder="000.000.000-00" />
            </div>
            <div>
              <label className={LABEL}>Telefone</label>
              <input className={CAMPO} name="socio_telefone" placeholder="(69) 99999-9999" />
            </div>
            <div>
              <label className={LABEL}>E-mail</label>
              <input className={CAMPO} type="email" name="socio_email" />
            </div>
          </div>
        )}

        {resultado && "erro" in resultado && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
            {resultado.erro}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            className="text-xs border border-primary text-primary rounded-lg px-3 py-1.5 font-semibold hover:bg-primary/5"
          >
            + Adicionar sócio
          </button>
        </div>
      </form>
    </div>
  );
}
