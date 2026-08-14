"use client";

import { useState } from "react";
import {
  inscreverEventoAction,
  verificarConvidadoEmailAction,
  adicionarConvidadoEquipeAction,
  removerConvidadoEquipeAction,
  removerInscricaoExternaAction
} from "@/app/evento/[id]/actions";
import { gerarPixCopiaECola } from "@/lib/eventos/pix";
import { PixQrcode } from "@/components/pix-qrcode";
import { PixAdminToggle } from "@/components/pix-admin-toggle";

const CAMPO =
  "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

type ConvidadoResumo = { id: string; nome: string; idade: number | null; paga: boolean; pago: boolean; devido: number };
type EquipeInfo = { parceiroId: string; nome: string; convidados: ConvidadoResumo[] };

function formatMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function badgeConvidado(c: ConvidadoResumo) {
  if (!c.paga) return { texto: "Grátis", cor: "bg-gray-50 text-gray-500 border-gray-200" };
  if (c.pago) return { texto: "Pago", cor: "bg-green-50 text-green-700 border-green-200" };
  return { texto: `Deve ${formatMoeda(c.devido)}`, cor: "bg-red-50 text-red-600 border-red-200" };
}

// Inscrição pública de convidado externo (Formulário Básico/Completo, Fase 3
// do módulo Eventos, pedido do usuário 10/08/2026) — mostrado só quando
// evento.formulario_inscricao está ativo (ver app/evento/[id]/page.tsx).
//
// Fase 6 (12/08/2026, depois do usuário apontar que a primeira versão
// "tava indo muito superficial"): o formulário agora começa sempre pedindo
// só o e-mail (verificarConvidadoEmailAction) e se ramifica em 3 telas —
// ver EtapaEquipe/EtapaExternoExistente/EtapaExternoNovo abaixo. Isso
// resolve, tudo junto: (1) quem é da equipe (Administrativo/Corretor/
// Corretor Estagiário) consegue voltar no MESMO link quantas vezes quiser
// e sempre vê a lista de quem já cadastrou, sem repetir os próprios dados;
// (2) convidado externo que volta no link não duplica inscrição, vê o
// status de novo; (3) convidado externo novo continua com o formulário de
// sempre (nome/telefone/idade/quem te convidou).
export function InscricaoEventoForm({
  eventoId,
  nomeEvento,
  completo,
  convidadoPor,
  cobraConvidado,
  valorConvidadoNumero,
  valorConvidado,
  idadeGratisAte
}: {
  eventoId: string;
  nomeEvento: string;
  completo: boolean;
  convidadoPor: { id: string; nome: string }[];
  cobraConvidado: boolean;
  valorConvidadoNumero: number | null;
  valorConvidado: string | null;
  idadeGratisAte: number;
}) {
  const [etapa, setEtapa] = useState<"email" | "equipe" | "externo_existente" | "externo_novo">("email");
  const [email, setEmail] = useState("");
  const [verificando, setVerificando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [equipeInfo, setEquipeInfo] = useState<EquipeInfo | null>(null);
  const [externoInfo, setExternoInfo] = useState<ConvidadoResumo | null>(null);

  async function verificarEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setVerificando(true);
    try {
      const fd = new FormData(e.currentTarget);
      const emailDigitado = String(fd.get("email") ?? "").trim();
      const resultado = await verificarConvidadoEmailAction(fd);
      if (resultado.tipo === "erro") {
        setErro(resultado.erro);
        return;
      }
      setEmail(emailDigitado);
      if (resultado.tipo === "equipe") {
        setEquipeInfo({ parceiroId: resultado.parceiroId, nome: resultado.nome, convidados: resultado.convidados });
        setEtapa("equipe");
      } else if (resultado.tipo === "externo_existente") {
        setExternoInfo(resultado.inscricao);
        setEtapa("externo_existente");
      } else {
        setEtapa("externo_novo");
      }
    } catch {
      setErro("Falha ao verificar seu e-mail. Tente de novo em instantes.");
    } finally {
      setVerificando(false);
    }
  }

  async function recarregarEquipe() {
    const fd = new FormData();
    fd.set("eventoId", eventoId);
    fd.set("email", email);
    const resultado = await verificarConvidadoEmailAction(fd);
    if (resultado.tipo === "equipe") {
      setEquipeInfo({ parceiroId: resultado.parceiroId, nome: resultado.nome, convidados: resultado.convidados });
    }
  }

  function trocarEmail() {
    setEtapa("email");
    setErro(null);
    setEquipeInfo(null);
    setExternoInfo(null);
  }

  if (etapa === "email") {
    return (
      <form onSubmit={verificarEmail} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-2">
        <input type="hidden" name="eventoId" value={eventoId} />
        <div className="text-sm font-bold text-gray-800 mb-1">Inscreva-se</div>
        <p className="text-xs text-gray-500 mb-1">
          Comece com seu e-mail — se você já é da equipe, a gente já te leva direto pra sua lista de convidados.
        </p>
        <div>
          <label className={LABEL}>E-mail</label>
          <input name="email" type="email" required className={CAMPO} />
        </div>
        {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{erro}</div>}
        <button
          type="submit"
          disabled={verificando}
          className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-60 mt-1"
        >
          {verificando ? "Verificando..." : "Continuar"}
        </button>
      </form>
    );
  }

  if (etapa === "equipe" && equipeInfo) {
    return (
      <EtapaEquipe
        eventoId={eventoId}
        nomeEvento={nomeEvento}
        email={email}
        info={equipeInfo}
        completo={completo}
        cobraConvidado={cobraConvidado}
        valorConvidado={valorConvidado}
        idadeGratisAte={idadeGratisAte}
        onAtualizar={recarregarEquipe}
        onTrocarEmail={trocarEmail}
      />
    );
  }

  if (etapa === "externo_existente" && externoInfo) {
    return (
      <EtapaExternoExistente
        eventoId={eventoId}
        email={email}
        nomeEvento={nomeEvento}
        info={externoInfo}
        valorConvidadoNumero={valorConvidadoNumero}
        onTrocarEmail={trocarEmail}
        onRemovido={trocarEmail}
      />
    );
  }

  return (
    <EtapaExternoNovo
      eventoId={eventoId}
      nomeEvento={nomeEvento}
      email={email}
      completo={completo}
      convidadoPor={convidadoPor}
      cobraConvidado={cobraConvidado}
      valorConvidadoNumero={valorConvidadoNumero}
      valorConvidado={valorConvidado}
      idadeGratisAte={idadeGratisAte}
      onTrocarEmail={trocarEmail}
    />
  );
}

// Quem já foi reconhecido como equipe (Administrativo/Corretor/Corretor
// Estagiário) pelo e-mail — vê a própria lista de convidados já cadastrados
// nesse evento e adiciona mais quando quiser, sem repetir os próprios dados
// nem escolher "quem convidou" (já se sabe quem é).
function EtapaEquipe({
  eventoId,
  nomeEvento,
  email,
  info,
  completo,
  cobraConvidado,
  valorConvidado,
  idadeGratisAte,
  onAtualizar,
  onTrocarEmail
}: {
  eventoId: string;
  nomeEvento: string;
  email: string;
  info: EquipeInfo;
  completo: boolean;
  cobraConvidado: boolean;
  valorConvidado: string | null;
  idadeGratisAte: number;
  onAtualizar: () => Promise<void>;
  onTrocarEmail: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [endereco, setEndereco] = useState("");
  const [profissao, setProfissao] = useState("");
  const [especialidade, setEspecialidade] = useState("");
  const [idade, setIdade] = useState("");
  const [removendoId, setRemovendoId] = useState<string | null>(null);

  async function adicionar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const fd = new FormData(e.currentTarget);
      const resultado = await adicionarConvidadoEquipeAction(fd);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      setNome("");
      setTelefone("");
      setEndereco("");
      setProfissao("");
      setEspecialidade("");
      setIdade("");
      await onAtualizar();
    } catch {
      setErro("Falha ao adicionar. Tente de novo em instantes.");
    } finally {
      setEnviando(false);
    }
  }

  // Remove um convidado já cadastrado (Fase 6b, 12/08/2026: "cadastrei os
  // convidados porém não tem como apagar, o qr code deles já estão
  // gerados"). Só convidado — a própria pessoa (equipe) não tem botão pra
  // apagar a própria resposta de presença aqui, isso fica só no Portal.
  async function remover(inscricaoId: string) {
    if (!window.confirm("Remover este convidado da lista?")) return;
    setErro(null);
    setRemovendoId(inscricaoId);
    try {
      const fd = new FormData();
      fd.set("eventoId", eventoId);
      fd.set("parceiroId", info.parceiroId);
      fd.set("email", email);
      fd.set("inscricaoId", inscricaoId);
      const resultado = await removerConvidadoEquipeAction(fd);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      await onAtualizar();
    } catch {
      setErro("Falha ao remover. Tente de novo em instantes.");
    } finally {
      setRemovendoId(null);
    }
  }

  const totalDevido = info.convidados.reduce((s, c) => s + c.devido, 0);
  const totalPago = info.convidados.reduce((s, c) => s + (c.pago ? c.devido : 0), 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-bold text-gray-800">Olá, {info.nome}!</div>
          <button type="button" onClick={onTrocarEmail} className="text-[10px] text-gray-400 hover:underline">
            Não é você?
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Seus convidados pra {nomeEvento}. Volte nesse mesmo link quando quiser pra adicionar mais.
        </p>
      </div>

      {info.convidados.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {cobraConvidado && (
            <div className="text-[11px] text-gray-500 mb-1">
              {info.convidados.length} convidado{info.convidados.length !== 1 ? "s" : ""} · {formatMoeda(totalPago)} pago
              {" "}de {formatMoeda(totalDevido)}
            </div>
          )}
          {info.convidados.map((c) => {
            const badge = badgeConvidado(c);
            return (
              <div key={c.id} className="border border-gray-100 rounded-lg p-2.5 text-xs text-gray-600">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-gray-800">
                    {c.nome}
                    {c.idade !== null && <span className="text-gray-400 font-normal"> · {c.idade} anos</span>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {cobraConvidado && (
                      <span className={`text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border ${badge.cor}`}>
                        {badge.texto}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => remover(c.id)}
                      disabled={removendoId === c.id}
                      className="text-[10px] text-red-500 font-semibold hover:underline disabled:opacity-50"
                    >
                      {removendoId === c.id ? "Removendo..." : "Remover"}
                    </button>
                  </div>
                </div>
                {c.paga && !c.pago && (
                  <div className="mt-1.5">
                    <PixAdminToggle
                      valor={c.devido}
                      codigo={gerarPixCopiaECola({ valor: c.devido, descricao: "Convite" })}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <form onSubmit={adicionar} className="border-t border-gray-100 pt-3 flex flex-col gap-2">
        <input type="hidden" name="eventoId" value={eventoId} />
        <input type="hidden" name="parceiroId" value={info.parceiroId} />
        <input type="hidden" name="email" value={email} />
        <div className="text-[11px] font-semibold text-gray-600">Adicionar convidado</div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            name="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome do convidado"
            required
            className={CAMPO + " flex-1 min-w-[140px]"}
          />
          {cobraConvidado && (
            <input
              name="idade"
              type="number"
              min={0}
              max={120}
              value={idade}
              onChange={(e) => setIdade(e.target.value)}
              placeholder="Idade"
              required
              className={CAMPO + " w-20"}
            />
          )}
          <button
            type="submit"
            disabled={enviando}
            className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-60 whitespace-nowrap"
          >
            {enviando ? "Adicionando..." : "+ Adicionar"}
          </button>
        </div>
        {/* Telefone/endereço/profissão/especialidade (Fase 6c, 14/08/2026) —
            segue o mesmo tipo_formulario do evento (Básico/Completo), igual
            ao formulário de convidado externo. Diferença: telefone aqui NÃO
            é required — a pessoa da equipe pode não saber o contato do
            convidado (ex.: filho pequeno), ver comentário em
            adicionarConvidadoEquipeAction. */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            name="telefone"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="Telefone (opcional)"
            className={CAMPO + " flex-1 min-w-[140px]"}
          />
        </div>
        {completo && (
          <>
            <input
              name="endereco"
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              placeholder="Endereço (opcional)"
              className={CAMPO}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <input
                name="profissao"
                value={profissao}
                onChange={(e) => setProfissao(e.target.value)}
                placeholder="Profissão (opcional)"
                className={CAMPO + " flex-1 min-w-[140px]"}
              />
              <input
                name="especialidade"
                value={especialidade}
                onChange={(e) => setEspecialidade(e.target.value)}
                placeholder="Especialidade (opcional)"
                className={CAMPO + " flex-1 min-w-[140px]"}
              />
            </div>
          </>
        )}
        {cobraConvidado && (
          <p className="text-[10px] text-gray-400">
            Entrada: {valorConvidado ?? "consulte"} por pessoa. Até {idadeGratisAte} anos não paga.
          </p>
        )}
        {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{erro}</div>}
      </form>
    </div>
  );
}

// Convidado externo que já tinha se inscrito com esse e-mail nesse evento —
// mostra o status em vez de deixar cadastrar de novo (evita duplicar).
function EtapaExternoExistente({
  eventoId,
  email,
  nomeEvento,
  info,
  valorConvidadoNumero,
  onTrocarEmail,
  onRemovido
}: {
  eventoId: string;
  email: string;
  nomeEvento: string;
  info: ConvidadoResumo;
  valorConvidadoNumero: number | null;
  onTrocarEmail: () => void;
  onRemovido: () => void;
}) {
  const [removendo, setRemovendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const badge = badgeConvidado(info);

  // Convidado externo cancelando a própria inscrição (Fase 6b, 12/08/2026,
  // mesmo pedido: "não tem como apagar... coloca botão pra apagar").
  async function cancelar() {
    if (!window.confirm("Cancelar sua inscrição neste evento?")) return;
    setErro(null);
    setRemovendo(true);
    try {
      const fd = new FormData();
      fd.set("eventoId", eventoId);
      fd.set("email", email);
      fd.set("inscricaoId", info.id);
      const resultado = await removerInscricaoExternaAction(fd);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      onRemovido();
    } catch {
      setErro("Falha ao cancelar. Tente de novo em instantes.");
    } finally {
      setRemovendo(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="text-sm font-bold text-gray-800">Você já se inscreveu, {info.nome}!</div>
          <button type="button" onClick={onTrocarEmail} className="text-[10px] text-gray-400 hover:underline shrink-0">
            Não é você?
          </button>
        </div>
        <p className="text-xs text-gray-500">Te esperamos em {nomeEvento}.</p>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className={`text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border ${badge.cor}`}>
            {badge.texto}
          </span>
          <button
            type="button"
            onClick={cancelar}
            disabled={removendo}
            className="text-[10px] text-red-500 font-semibold hover:underline disabled:opacity-50"
          >
            {removendo ? "Cancelando..." : "Cancelar minha inscrição"}
          </button>
        </div>
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mt-2">{erro}</div>
        )}
      </div>
      {info.paga && !info.pago && valorConvidadoNumero && (
        <PixQrcode
          valor={info.devido}
          codigo={gerarPixCopiaECola({ valor: info.devido, descricao: "Convite" })}
        />
      )}
    </div>
  );
}

// Convidado externo novo — formulário completo de sempre (nome, e-mail já
// verificado no passo 1, telefone, idade, "quem te convidou").
function EtapaExternoNovo({
  eventoId,
  nomeEvento,
  email,
  completo,
  convidadoPor,
  cobraConvidado,
  valorConvidadoNumero,
  valorConvidado,
  idadeGratisAte,
  onTrocarEmail
}: {
  eventoId: string;
  nomeEvento: string;
  email: string;
  completo: boolean;
  convidadoPor: { id: string; nome: string }[];
  cobraConvidado: boolean;
  valorConvidadoNumero: number | null;
  valorConvidado: string | null;
  idadeGratisAte: number;
  onTrocarEmail: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [idadeSubmetida, setIdadeSubmetida] = useState<number | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const fd = new FormData(e.currentTarget);
      const resultado = await inscreverEventoAction(fd);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      const idadeTexto = fd.get("idade");
      setIdadeSubmetida(typeof idadeTexto === "string" && idadeTexto ? Number(idadeTexto) : null);
      setSucesso(true);
    } catch {
      setErro("Falha ao enviar sua inscrição. Tente de novo em instantes.");
    } finally {
      setEnviando(false);
    }
  }

  const ehPagante = cobraConvidado && idadeSubmetida !== null && idadeSubmetida > idadeGratisAte;

  if (sucesso) {
    return (
      <div className="flex flex-col gap-3">
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl p-4">
          Inscrição recebida! Te esperamos no evento.
        </div>
        {ehPagante && valorConvidadoNumero && (
          <PixQrcode
            valor={valorConvidadoNumero}
            codigo={gerarPixCopiaECola({ valor: valorConvidadoNumero, descricao: "Convite" })}
          />
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-2">
      <input type="hidden" name="eventoId" value={eventoId} />
      <input type="hidden" name="email" value={email} />
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-sm font-bold text-gray-800">Inscreva-se</div>
        <button type="button" onClick={onTrocarEmail} className="text-[10px] text-gray-400 hover:underline shrink-0">
          Trocar e-mail
        </button>
      </div>
      <p className="text-[11px] text-gray-400 -mt-1 mb-1">{email}</p>

      <div>
        <label className={LABEL}>Nome</label>
        <input name="nome" required className={CAMPO} />
      </div>
      <div>
        <label className={LABEL}>Telefone</label>
        <input name="telefone" required className={CAMPO} />
      </div>

      {completo && (
        <>
          <div>
            <label className={LABEL}>Endereço</label>
            <input name="endereco" className={CAMPO} />
          </div>
          <div className="grid md:grid-cols-2 gap-2">
            <div>
              <label className={LABEL}>Profissão</label>
              <input name="profissao" className={CAMPO} />
            </div>
            <div>
              <label className={LABEL}>Especialidade</label>
              <input name="especialidade" className={CAMPO} />
            </div>
          </div>
        </>
      )}

      <div>
        <label className={LABEL}>Quem te convidou?</label>
        <select name="convidado_por_id" defaultValue="" className={CAMPO}>
          <option value="">Prefiro não informar</option>
          {convidadoPor.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>

      {cobraConvidado && (
        <div>
          <label className={LABEL}>Sua idade</label>
          <input name="idade" type="number" min={0} max={120} required className={CAMPO} />
          <p className="text-[10px] text-gray-400 mt-1">
            Entrada: {valorConvidado ?? "consulte"} por pessoa. Até {idadeGratisAte} anos não paga.
          </p>
        </div>
      )}

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{erro}</div>}

      <button
        type="submit"
        disabled={enviando}
        className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-60 mt-1"
      >
        {enviando ? "Enviando..." : "Confirmar inscrição"}
      </button>
    </form>
  );
}
