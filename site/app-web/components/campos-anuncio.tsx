"use client";

import { idDoLinkAnuncio, EXEMPLO_ID_ANUNCIO, validarIdELink } from "@/lib/gestoes/anuncio";

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

// ID + link do anúncio do imóvel no site, sempre juntos (o link é obrigatório quando há ID). Controlado: quem usa
// guarda `id` e `url` e recebe as mudanças em `aoMudar`. `nomeId`/`nomeUrl` só são necessários dentro de um
// <form> que lê via FormData (cadastro do imóvel). Ao colar o link, o ID é preenchido sozinho se ainda estiver
// vazio (o link termina com o ID). Com `grade`, devolve o link e o ID como células soltas (mais um aviso que
// ocupa a linha toda) para entrar numa grade de 2 colunas, como no cadastro do imóvel.
export function CamposAnuncio({
  id,
  url,
  aoMudar,
  nomeId,
  nomeUrl,
  grade
}: {
  id: string;
  url: string;
  aoMudar: (id: string, url: string) => void;
  nomeId?: string;
  nomeUrl?: string;
  grade?: boolean;
}) {
  const link = url.trim();
  const idDoLink = link ? idDoLinkAnuncio(link) : null;
  const divergente = Boolean(id.trim() && idDoLink && idDoLink !== id.trim());
  const erro = validarIdELink(id, url);

  const campoLink = (
    <div>
      <label className={LABEL}>Anúncio no site (link) {id.trim() && <span className="text-red-500">*</span>}</label>
      <div className="flex gap-1.5">
        <input
          className={CAMPO}
          name={nomeUrl}
          value={url}
          onChange={(e) => {
            const novo = e.target.value;
            const doLink = idDoLinkAnuncio(novo);
            aoMudar(!id.trim() && doLink ? doLink : id, novo);
          }}
          placeholder="https://www.remax.com.br/pt-br/imoveis/…"
          autoComplete="off"
        />
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-gray-50 hover:text-primary font-semibold"
            title="Abrir anúncio"
          >
            Abrir ↗
          </a>
        )}
      </div>
    </div>
  );

  const campoId = (
    <div>
      <label className={LABEL}>ID do anúncio</label>
      <input
        className={CAMPO}
        name={nomeId}
        value={id}
        onChange={(e) => aoMudar(e.target.value, url)}
        placeholder={EXEMPLO_ID_ANUNCIO}
        inputMode="numeric"
        autoComplete="off"
      />
    </div>
  );

  const avisos = (
    <>
      {divergente && <p className="text-[11px] text-amber-600">O link termina em {idDoLink}, diferente do ID informado. Confira antes de salvar.</p>}
      {erro && (id.trim() || link) && <p className="text-[11px] text-red-600">{erro}</p>}
    </>
  );

  if (grade) {
    return (
      <>
        {campoLink}
        {campoId}
        {(divergente || (erro && (id.trim() || link))) && <div className="md:col-span-2 flex flex-col gap-1">{avisos}</div>}
      </>
    );
  }

  // Na janela de confirmação o ID vem primeiro (a pergunta é "qual o ID?"), depois o link.
  return (
    <div className="flex flex-col gap-2.5">
      {campoId}
      {campoLink}
      {avisos}
    </div>
  );
}
