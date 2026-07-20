"use client";

import { useState } from "react";
import { verificarEmailPortalAction } from "@/app/portal/actions";

const CAMPO = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary";
const LABEL = "text-xs text-gray-600 block mb-1";

// Login do portal em duas etapas: primeiro só o email, depois — já sabendo
// se essa pessoa nunca definiu senha nenhuma — mostra "Crie sua senha" (com
// confirmação) ou "Digite sua senha", nunca as duas coisas misturadas num
// campo ambíguo. Antes era um formulário só com "Senha" pra tudo (o próprio
// texto embaixo explicava "primeiro acesso? escolha a senha que quiser
// aqui"), só que na prática os corretores testando não notavam essa
// explicação e travavam achando que precisavam de uma senha que o admin
// ainda não tinha passado. Pedido do usuário: deixar isso óbvio na tela.
export function PortalLoginForm({
  action,
  erro,
  emailInicial
}: {
  action: (formData: FormData) => void;
  erro?: string;
  emailInicial?: string;
}) {
  const [passo, setPasso] = useState<"email" | "senha">(emailInicial ? "senha" : "email");
  const [email, setEmail] = useState(emailInicial ?? "");
  const [nome, setNome] = useState("");
  // Se a gente já cai direto no passo "senha" (voltando de um erro de login,
  // ex.: senha incorreta), ainda não sabe se é primeiro acesso sem consultar
  // de novo — trata como "não é" (o erro mais comum aqui é senha errada de
  // quem já tinha conta), a pessoa sempre pode voltar e trocar o email.
  const [primeiroAcesso, setPrimeiroAcesso] = useState(false);
  const [erroLocal, setErroLocal] = useState("");
  const [verificando, setVerificando] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");

  async function verificarEmail() {
    setErroLocal("");
    setVerificando(true);
    const resultado = await verificarEmailPortalAction(email);
    setVerificando(false);
    if (!resultado.ok) {
      setErroLocal(resultado.error);
      return;
    }
    setNome(resultado.nome);
    setPrimeiroAcesso(resultado.primeiroAcesso);
    setPasso("senha");
  }

  if (passo === "email") {
    return (
      <div>
        {erro && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">{erro}</div>}
        {erroLocal && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">{erroLocal}</div>
        )}

        <label className={LABEL}>Email @remax.com.br</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), verificarEmail())}
          required
          autoFocus
          className={`${CAMPO} mb-6`}
          placeholder="seunome@remax.com.br"
        />

        <button
          type="button"
          onClick={verificarEmail}
          disabled={verificando || !email}
          className="w-full bg-primary text-white rounded-lg py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-60"
        >
          {verificando ? "Verificando..." : "Continuar"}
        </button>

        <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">
          Acesso restrito a quem tem função Corretor ativa no cadastro de parceiros, com esse email
          cadastrado na ficha.
        </p>
      </div>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="email" value={email} />

      {erro && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">{erro}</div>}

      {primeiroAcesso ? (
        <>
          <div className="text-sm text-gray-800 mb-1">
            {nome ? `Olá, ${nome.split(" ")[0]}!` : "Olá!"} Esse é seu primeiro acesso.
          </div>
          <p className="text-xs text-gray-500 mb-4">Crie uma senha — ela já fica valendo na hora.</p>

          <label className={LABEL}>Crie sua senha (mínimo 6 caracteres)</label>
          <input
            type="password"
            name="senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            minLength={6}
            className={`${CAMPO} mb-4`}
            placeholder="Nova senha"
          />

          <label className={LABEL}>Confirme a senha</label>
          <input
            type="password"
            value={confirmarSenha}
            onChange={(e) => setConfirmarSenha(e.target.value)}
            required
            minLength={6}
            className={CAMPO}
            placeholder="Repita a senha"
          />
          {confirmarSenha && senha !== confirmarSenha && (
            <p className="text-[11px] text-red-600 mt-1">As senhas não coincidem.</p>
          )}

          <button
            type="submit"
            disabled={senha.length < 6 || senha !== confirmarSenha}
            className="w-full bg-primary text-white rounded-lg py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-60 mt-6"
          >
            Criar senha e entrar
          </button>
        </>
      ) : (
        <>
          <div className="text-sm text-gray-800 mb-4">
            {nome ? `Olá, ${nome.split(" ")[0]}! Bem-vindo de volta.` : "Digite sua senha."}
          </div>

          <label className={LABEL}>Senha</label>
          <input type="password" name="senha" required autoFocus className={`${CAMPO} mb-6`} placeholder="Sua senha" />

          <button
            type="submit"
            className="w-full bg-primary text-white rounded-lg py-2 text-sm font-semibold hover:opacity-90"
          >
            Entrar
          </button>
        </>
      )}

      <button
        type="button"
        onClick={() => {
          setPasso("email");
          setErroLocal("");
          setSenha("");
          setConfirmarSenha("");
        }}
        className="w-full text-xs text-gray-500 hover:text-gray-800 mt-4"
      >
        ← Trocar email
      </button>

      {!primeiroAcesso && (
        <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">
          Esqueceu a senha? Peça pra um administrador redefinir em Configurações.
        </p>
      )}
    </form>
  );
}
