"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LARGURA_MAXIMA_ORIGINAL,
  PROPORCOES_IMAGEM,
  montarHtmlDisparo,
  type ProporcaoImagem
} from "@/lib/documentos/disparo-email";
import type { DadosDisparo } from "@/lib/documentos/disparo-email-servidor";
import {
  contarDestinatariosAction,
  criarDisparoEmailAction,
  enviarTesteDisparoAction,
  prepararUploadImagemEmailAction,
  retomarDisparoEmailAction,
  type MensagemDisparoEntrada
} from "@/lib/documentos/disparo-email-actions";
import { supabaseBrowser, BUCKET_EMAILS } from "@/lib/supabase-browser";

// Disparo de e-mail em massa (Documentos). Escolhe quem recebe (funções de
// parceiros e uma quantidade de clientes), monta a mensagem centralizada com
// imagem na proporção escolhida e link com botão, mostra a prévia e envia pelo
// Resend em lotes, com barra de progresso.

type Ordem = "recentes" | "antigos" | "aleatorio";
type Progresso = { enviados: number; falhas: number; pendentes: number; total: number };

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-[11px] text-gray-600 block mb-0.5";
const CARTAO = "bg-white border border-gray-200 rounded-xl p-4";

// Recorta a imagem na proporção escolhida (ou só reduz, no "original") e devolve um
// JPEG. O ponto de foco (0, 0,5 ou 1) diz que parte da imagem fica quando sobra.
async function recortarImagem(arquivo: File, proporcao: ProporcaoImagem, focoX: number, focoY: number): Promise<File> {
  const bitmap = await createImageBitmap(arquivo);
  let largura = proporcao.largura;
  let altura = proporcao.altura;
  let origemX = 0;
  let origemY = 0;
  let origemL = bitmap.width;
  let origemA = bitmap.height;

  if (proporcao.id === "original") {
    largura = Math.min(bitmap.width, LARGURA_MAXIMA_ORIGINAL);
    altura = Math.round((bitmap.height * largura) / bitmap.width);
  } else {
    const alvo = largura / altura;
    if (bitmap.width / bitmap.height > alvo) {
      origemL = bitmap.height * alvo;
      origemX = (bitmap.width - origemL) * focoX;
    } else {
      origemA = bitmap.width / alvo;
      origemY = (bitmap.height - origemA) * focoY;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não consegui preparar a imagem neste navegador.");
  ctx.fillStyle = "#ffffff"; // PNG com fundo transparente vira branco no JPEG
  ctx.fillRect(0, 0, largura, altura);
  ctx.drawImage(bitmap, origemX, origemY, origemL, origemA, 0, 0, largura, altura);
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  if (!blob) throw new Error("Não consegui converter a imagem.");
  return new File([blob], `${arquivo.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
}

function formatarData(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Porto_Velho" });
}

export function DisparoEmailForm({ dados, remetenteEndereco }: { dados: DadosDisparo; remetenteEndereco: string }) {
  const router = useRouter();

  // ---- quem recebe
  const [funcoes, setFuncoes] = useState<Set<string>>(new Set());
  const [incluirClientes, setIncluirClientes] = useState(false);
  const [qtdClientes, setQtdClientes] = useState("50");
  const [ordem, setOrdem] = useState<Ordem>("recentes");

  // ---- mensagem
  const [remetenteNome, setRemetenteNome] = useState("SisEng");
  const [responderPara, setResponderPara] = useState(dados.emailAdmin ?? "");
  const [assunto, setAssunto] = useState("");
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTexto, setLinkTexto] = useState("Acessar");

  // ---- imagem
  const [arquivoOriginal, setArquivoOriginal] = useState<File | null>(null);
  const [proporcaoId, setProporcaoId] = useState("16:9");
  const [focoX, setFocoX] = useState(0.5);
  const [focoY, setFocoY] = useState(0.5);
  const [imagemPronta, setImagemPronta] = useState<File | null>(null);
  const [imagemPreview, setImagemPreview] = useState<string | null>(null);
  const [erroImagem, setErroImagem] = useState("");
  const hospedada = useRef<{ arquivo: File; url: string } | null>(null);

  // ---- envio
  const [paraTeste, setParaTeste] = useState(dados.emailAdmin ?? "");
  const [ocupado, setOcupado] = useState<null | "teste" | "envio">(null);
  const [etapa, setEtapa] = useState("");
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro" | "pausa"; texto: string } | null>(null);

  const proporcao = PROPORCOES_IMAGEM.find((p) => p.id === proporcaoId) ?? PROPORCOES_IMAGEM[0];

  // Recorta de novo sempre que a imagem, a proporção ou o foco mudam.
  useEffect(() => {
    if (!arquivoOriginal) {
      setImagemPronta(null);
      setImagemPreview(null);
      return;
    }
    let cancelado = false;
    let url: string | null = null;
    recortarImagem(arquivoOriginal, proporcao, focoX, focoY)
      .then((arquivo) => {
        if (cancelado) return;
        setErroImagem("");
        setImagemPronta(arquivo);
        url = URL.createObjectURL(arquivo);
        setImagemPreview(url);
      })
      .catch((e: unknown) => {
        if (!cancelado) setErroImagem(e instanceof Error ? e.message : "Não consegui ler essa imagem.");
      });
    return () => {
      cancelado = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [arquivoOriginal, proporcao, focoX, focoY]);

  const estimativa = useMemo(() => {
    const deFuncoes = dados.funcoes.filter((f) => funcoes.has(f.funcao)).reduce((acc, f) => acc + f.total, 0);
    const qtd = Math.max(0, Math.min(Number(qtdClientes) || 0, dados.clientesDisponiveis));
    return { deFuncoes, clientes: incluirClientes ? qtd : 0, total: deFuncoes + (incluirClientes ? qtd : 0) };
  }, [dados, funcoes, incluirClientes, qtdClientes]);

  const previa = useMemo(
    () => montarHtmlDisparo({ titulo, mensagem, imagemUrl: imagemPreview, linkUrl, linkTexto }, assunto || "Assunto do e-mail"),
    [titulo, mensagem, imagemPreview, linkUrl, linkTexto, assunto]
  );

  function alternarFuncao(f: string) {
    setFuncoes((atual) => {
      const novo = new Set(atual);
      if (novo.has(f)) novo.delete(f);
      else novo.add(f);
      return novo;
    });
  }

  function escolherArquivo(arquivo: File | null) {
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) {
      setErroImagem("Escolha um arquivo de imagem (JPG, PNG, WEBP...).");
      return;
    }
    setErroImagem("");
    setArquivoOriginal(arquivo);
  }

  // O e-mail precisa de uma imagem com endereço público: sobe a imagem recortada uma
  // vez só e reaproveita se nada mudou (teste e envio usam a mesma).
  async function garantirImagemHospedada(): Promise<string | null> {
    if (!imagemPronta) return null;
    if (hospedada.current?.arquivo === imagemPronta) return hospedada.current.url;
    setEtapa("Enviando a imagem...");
    const preparo = await prepararUploadImagemEmailAction();
    if (!preparo.ok) throw new Error(preparo.erro);
    const { error } = await supabaseBrowser().storage.from(BUCKET_EMAILS).uploadToSignedUrl(preparo.caminho, preparo.token, imagemPronta, { contentType: "image/jpeg" });
    if (error) throw new Error(`Falha ao enviar a imagem: ${error.message}`);
    hospedada.current = { arquivo: imagemPronta, url: preparo.urlPublica };
    return preparo.urlPublica;
  }

  function montarMensagem(imagemUrl: string | null): MensagemDisparoEntrada {
    return { assunto, remetenteNome, responderPara, titulo, mensagem, imagemUrl, linkUrl, linkTexto };
  }

  async function enviarTeste() {
    setAviso(null);
    setOcupado("teste");
    try {
      const imagemUrl = await garantirImagemHospedada();
      setEtapa("Enviando o teste...");
      const r = await enviarTesteDisparoAction(montarMensagem(imagemUrl), paraTeste);
      setAviso(r.ok ? { tipo: "ok", texto: `Teste enviado para ${paraTeste}. Confira a caixa de entrada (e o spam).` } : { tipo: "erro", texto: r.erro });
    } catch (e) {
      setAviso({ tipo: "erro", texto: e instanceof Error ? e.message : "Não foi possível enviar o teste." });
    } finally {
      setOcupado(null);
      setEtapa("");
    }
  }

  // Chama a rota de lotes até não sobrar e-mail pendente (ou o limite do Resend pausar).
  async function executarLotes(disparoId: string, totalInicial: number) {
    setProgresso({ enviados: 0, falhas: 0, pendentes: totalInicial, total: totalInicial });
    let falhasSeguidas = 0;
    for (;;) {
      let resposta: Response;
      try {
        resposta = await fetch("/documentos/disparo-email/lote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ disparoId })
        });
      } catch {
        resposta = new Response(null, { status: 599 });
      }
      if (!resposta.ok) {
        falhasSeguidas += 1;
        if (falhasSeguidas >= 3) {
          setAviso({ tipo: "pausa", texto: "O envio foi interrompido (conexão ou limite de tempo). Os que faltam continuam pelo botão “Continuar envio” no histórico abaixo." });
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      falhasSeguidas = 0;
      const r = (await resposta.json()) as Progresso & { status: string; motivoPausa: string | null };
      setProgresso({ enviados: r.enviados, falhas: r.falhas, pendentes: r.pendentes, total: r.total });
      if (r.pendentes === 0) {
        setAviso({
          tipo: r.falhas > 0 ? "pausa" : "ok",
          texto: `Disparo concluído: ${r.enviados} enviado${r.enviados === 1 ? "" : "s"}${r.falhas > 0 ? ` e ${r.falhas} com falha (endereço recusado)` : ""}.`
        });
        return;
      }
      if (r.motivoPausa) {
        setAviso({ tipo: "pausa", texto: `${r.motivoPausa} Enviados até agora: ${r.enviados} de ${r.total}.` });
        return;
      }
    }
  }

  async function enviar() {
    setAviso(null);
    if (!assunto.trim()) return setAviso({ tipo: "erro", texto: "Escreva o assunto do e-mail." });
    if (!mensagem.trim() && !imagemPronta) return setAviso({ tipo: "erro", texto: "Escreva a mensagem ou coloque uma imagem." });
    const filtro = {
      funcoes: [...funcoes],
      clientes: incluirClientes && Number(qtdClientes) > 0 ? { quantidade: Number(qtdClientes), ordem } : null
    };
    if (filtro.funcoes.length === 0 && !filtro.clientes) return setAviso({ tipo: "erro", texto: "Marque quem vai receber: alguma função de parceiros e/ou clientes." });

    setOcupado("envio");
    try {
      setEtapa("Conferindo os destinatários...");
      const contagem = await contarDestinatariosAction(filtro);
      if (contagem.total === 0) {
        setAviso({ tipo: "erro", texto: "Nenhum destinatário com e-mail válido nas opções marcadas." });
        return;
      }
      const limite =
        contagem.total > 100
          ? "\n\nAtenção: o plano grátis do Resend envia até 100 e-mails por dia. Se passar disso, o envio pausa e o resto continua no dia seguinte, pelo botão “Continuar envio”."
          : "";
      const ok = window.confirm(
        `Enviar “${assunto.trim()}” para ${contagem.total} pessoa${contagem.total === 1 ? "" : "s"} (${contagem.parceiros} parceiro${contagem.parceiros === 1 ? "" : "s"} e ${contagem.clientes} cliente${contagem.clientes === 1 ? "" : "s"})?${limite}\n\nDepois de confirmar, não dá para desfazer.`
      );
      if (!ok) return;

      const imagemUrl = await garantirImagemHospedada();
      setEtapa("Preparando o disparo...");
      const criado = await criarDisparoEmailAction(montarMensagem(imagemUrl), filtro);
      if (!criado.ok) {
        setAviso({ tipo: "erro", texto: criado.erro });
        return;
      }
      setEtapa("Enviando...");
      await executarLotes(criado.disparoId, criado.total);
      router.refresh();
    } catch (e) {
      setAviso({ tipo: "erro", texto: e instanceof Error ? e.message : "Não foi possível enviar." });
    } finally {
      setOcupado(null);
      setEtapa("");
    }
  }

  async function continuarEnvio(disparoId: string) {
    setAviso(null);
    setOcupado("envio");
    try {
      const r = await retomarDisparoEmailAction(disparoId);
      if (!r.ok) {
        setAviso({ tipo: "erro", texto: r.erro });
        return;
      }
      setEtapa("Enviando...");
      await executarLotes(disparoId, r.pendentes);
      router.refresh();
    } finally {
      setOcupado(null);
      setEtapa("");
    }
  }

  const pct = progresso && progresso.total > 0 ? Math.round(((progresso.enviados + progresso.falhas) / progresso.total) * 100) : 0;

  return (
    <div className={CARTAO}>
      <div className="text-sm font-bold text-gray-800 mb-1">Disparo de e-mail em massa</div>
      <p className="text-xs text-gray-500 mb-4">
        Para compartilhar novidades e informações. Escolha quem recebe, monte a mensagem (sempre centralizada), confira a prévia, mande um teste para você e dispare.
      </p>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* ---------------- Coluna da esquerda: formulário ---------------- */}
        <div className="flex flex-col gap-5">
          {/* Quem recebe */}
          <section>
            <div className="text-xs font-bold text-gray-700 mb-2">1. Quem recebe</div>
            <div className="text-[11px] font-semibold text-gray-500 mb-1.5 flex items-center justify-between">
              <span>Parceiros por função (ativos, com e-mail)</span>
              <span className="font-normal">
                <button type="button" onClick={() => setFuncoes(new Set(dados.funcoes.filter((f) => f.total > 0).map((f) => f.funcao)))} className="underline hover:text-gray-700">
                  marcar todas
                </button>
                {" · "}
                <button type="button" onClick={() => setFuncoes(new Set())} className="underline hover:text-gray-700">
                  limpar
                </button>
              </span>
            </div>
            <div className="grid sm:grid-cols-2 gap-1.5">
              {dados.funcoes.map((f) => (
                <label
                  key={f.funcao}
                  className={`flex items-center gap-2 text-xs border rounded-lg px-3 py-2 ${
                    f.total === 0 ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                  } ${funcoes.has(f.funcao) ? "border-primary bg-primary/5" : "border-gray-200 hover:bg-gray-50"}`}
                >
                  <input type="checkbox" disabled={f.total === 0} checked={funcoes.has(f.funcao)} onChange={() => alternarFuncao(f.funcao)} />
                  <span className="flex-1 text-gray-700">{f.funcao}</span>
                  <span className="text-[11px] text-gray-400">{f.total}</span>
                </label>
              ))}
            </div>

            <div className="mt-3 border border-gray-200 rounded-lg p-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
                <input type="checkbox" checked={incluirClientes} onChange={(e) => setIncluirClientes(e.target.checked)} />
                Incluir clientes
                <span className="font-normal text-[11px] text-gray-400">({dados.clientesDisponiveis} com e-mail cadastrado)</span>
              </label>
              {incluirClientes && (
                <div className="mt-2 flex items-end gap-2 flex-wrap">
                  <div>
                    <label className={LABEL} htmlFor="de-qtd">
                      Quantidade de clientes
                    </label>
                    <input
                      id="de-qtd"
                      type="number"
                      min={1}
                      max={dados.clientesDisponiveis}
                      className={`${CAMPO} !w-32`}
                      value={qtdClientes}
                      onChange={(e) => setQtdClientes(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setQtdClientes(String(dados.clientesDisponiveis))}
                    className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50"
                  >
                    Todos
                  </button>
                  <div>
                    <label className={LABEL} htmlFor="de-ordem">
                      Quais clientes
                    </label>
                    <select id="de-ordem" className={CAMPO} value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>
                      <option value="recentes">Os mais recentes</option>
                      <option value="antigos">Os mais antigos</option>
                      <option value="aleatorio">Aleatórios</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-2 text-[11px] text-gray-500">
              {estimativa.total > 0 ? (
                <>
                  Até <strong>{estimativa.total}</strong> destinatário{estimativa.total === 1 ? "" : "s"} ({estimativa.deFuncoes} parceiro{estimativa.deFuncoes === 1 ? "" : "s"}
                  {incluirClientes ? ` e ${estimativa.clientes} cliente${estimativa.clientes === 1 ? "" : "s"}` : ""}). E-mails repetidos são enviados uma vez só.
                </>
              ) : (
                "Marque pelo menos uma função ou inclua clientes."
              )}
            </div>
          </section>

          {/* Mensagem */}
          <section>
            <div className="text-xs font-bold text-gray-700 mb-2">2. Mensagem</div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className={LABEL} htmlFor="de-nome">
                  Nome do remetente
                </label>
                <input id="de-nome" className={CAMPO} value={remetenteNome} onChange={(e) => setRemetenteNome(e.target.value)} />
                <div className="text-[10px] text-gray-400 mt-0.5">Sai de {remetenteEndereco}</div>
              </div>
              <div>
                <label className={LABEL} htmlFor="de-resp">
                  Respostas vão para
                </label>
                <input id="de-resp" type="email" className={CAMPO} value={responderPara} onChange={(e) => setResponderPara(e.target.value)} placeholder="seu@email.com.br" />
                <div className="text-[10px] text-gray-400 mt-0.5">Quem responder fala com este e-mail.</div>
              </div>
              <div className="sm:col-span-2">
                <label className={LABEL} htmlFor="de-assunto">
                  Assunto *
                </label>
                <input id="de-assunto" className={CAMPO} value={assunto} onChange={(e) => setAssunto(e.target.value)} maxLength={200} />
              </div>
            </div>

            {/* Imagem */}
            <div className="mt-3 border border-gray-200 rounded-lg p-3">
              <div className="text-[11px] font-semibold text-gray-500 mb-1.5">Imagem (opcional)</div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {PROPORCOES_IMAGEM.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProporcaoId(p.id)}
                    className={`text-[11px] border rounded-lg px-2.5 py-1 ${proporcaoId === p.id ? "border-primary bg-primary/5 text-gray-900 font-semibold" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                  >
                    {p.rotulo}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-xs bg-white border border-gray-300 text-gray-700 rounded-lg px-3 py-1.5 font-semibold cursor-pointer hover:bg-gray-50">
                  {arquivoOriginal ? "Trocar imagem" : "Escolher imagem"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      escolherArquivo(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                </label>
                {arquivoOriginal && (
                  <button type="button" onClick={() => setArquivoOriginal(null)} className="text-[11px] text-gray-400 hover:text-red-600">
                    remover
                  </button>
                )}
                {arquivoOriginal && proporcao.id !== "original" && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500">Foco do recorte:</span>
                    <div className="grid grid-cols-3 gap-0.5">
                      {[0, 0.5, 1].flatMap((y) =>
                        [0, 0.5, 1].map((x) => (
                          <button
                            key={`${x}-${y}`}
                            type="button"
                            aria-label={`Foco ${y === 0 ? "em cima" : y === 1 ? "embaixo" : "no meio"}, ${x === 0 ? "à esquerda" : x === 1 ? "à direita" : "ao centro"}`}
                            onClick={() => {
                              setFocoX(x);
                              setFocoY(y);
                            }}
                            className={`w-4 h-4 rounded-sm border ${focoX === x && focoY === y ? "bg-primary border-primary" : "bg-gray-100 border-gray-300 hover:bg-gray-200"}`}
                          />
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="text-[10px] text-gray-400 mt-1.5">
                A imagem é recortada na proporção marcada e ajustada ao e-mail, para todos os disparos saírem no mesmo padrão.
              </div>
              {erroImagem && <div className="text-xs text-red-600 mt-1">{erroImagem}</div>}
            </div>

            <div className="mt-3 flex flex-col gap-3">
              <div>
                <label className={LABEL} htmlFor="de-titulo">
                  Título (opcional)
                </label>
                <input id="de-titulo" className={CAMPO} value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={150} />
              </div>
              <div>
                <label className={LABEL} htmlFor="de-msg">
                  Mensagem *
                </label>
                <textarea id="de-msg" className={`${CAMPO} min-h-32`} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
                <div className="text-[10px] text-gray-400 mt-0.5">O texto sai centralizado. Uma linha em branco separa os parágrafos.</div>
              </div>
              <div className="grid sm:grid-cols-[1fr_9rem] gap-3">
                <div>
                  <label className={LABEL} htmlFor="de-link">
                    Link (opcional)
                  </label>
                  <input id="de-link" className={CAMPO} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." inputMode="url" />
                </div>
                <div>
                  <label className={LABEL} htmlFor="de-botao">
                    Texto do botão
                  </label>
                  <input id="de-botao" className={CAMPO} value={linkTexto} onChange={(e) => setLinkTexto(e.target.value)} maxLength={40} />
                </div>
              </div>
              <div className="text-[10px] text-gray-400 -mt-2">Com o link preenchido, aparece um botão de acesso embaixo da mensagem.</div>
            </div>
          </section>

          {/* Teste e envio */}
          <section>
            <div className="text-xs font-bold text-gray-700 mb-2">3. Testar e enviar</div>
            <div className="flex items-end gap-2 flex-wrap">
              <div className="flex-1 min-w-48">
                <label className={LABEL} htmlFor="de-teste">
                  Enviar um teste para
                </label>
                <input id="de-teste" type="email" className={CAMPO} value={paraTeste} onChange={(e) => setParaTeste(e.target.value)} />
              </div>
              <button
                type="button"
                onClick={enviarTeste}
                disabled={ocupado !== null}
                className="text-xs border border-gray-300 rounded-lg px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {ocupado === "teste" ? etapa || "Enviando..." : "Enviar teste"}
              </button>
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={enviar}
                disabled={ocupado !== null}
                className="bg-primary text-white rounded-lg px-5 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-60 disabled:cursor-wait inline-flex items-center gap-2"
              >
                {ocupado === "envio" && <span className="w-3 h-3 border-2 rounded-full animate-spin border-white/40 border-t-white shrink-0" />}
                {ocupado === "envio" ? etapa || "Enviando..." : estimativa.total > 0 ? `Enviar para até ${estimativa.total} pessoa${estimativa.total === 1 ? "" : "s"}` : "Enviar"}
              </button>
            </div>

            {progresso && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-[11px] text-gray-600 mb-1">
                  <span>
                    {progresso.enviados} enviado{progresso.enviados === 1 ? "" : "s"}
                    {progresso.falhas > 0 ? ` · ${progresso.falhas} com falha` : ""} · {progresso.pendentes} faltando
                  </span>
                  <span>{pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                </div>
                {ocupado === "envio" && <div className="text-[10px] text-gray-400 mt-1">Não feche esta página até terminar.</div>}
              </div>
            )}

            {aviso && (
              <div
                className={`mt-3 text-xs rounded-lg border px-3 py-2 ${
                  aviso.tipo === "ok" ? "bg-green-50 border-green-200 text-green-800" : aviso.tipo === "pausa" ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-red-50 border-red-200 text-red-700"
                }`}
              >
                {aviso.texto}
              </div>
            )}
          </section>
        </div>

        {/* ---------------- Coluna da direita: prévia ---------------- */}
        <div className="lg:sticky lg:top-4 self-start">
          <div className="text-xs font-bold text-gray-700 mb-2">Prévia</div>
          <div className="text-[11px] text-gray-500 mb-1 truncate">
            <strong>{remetenteNome || "SisEng"}</strong> &lt;{remetenteEndereco}&gt; · {assunto || "Assunto do e-mail"}
          </div>
          <iframe title="Prévia do e-mail" sandbox="allow-same-origin" srcDoc={previa} className="w-full h-[640px] border border-gray-200 rounded-xl bg-white" />
        </div>
      </div>

      {/* ---------------- Histórico ---------------- */}
      {dados.historico.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-100">
          <div className="text-xs font-bold text-gray-700 mb-2">Últimos disparos</div>
          <div className="flex flex-col gap-1.5">
            {dados.historico.map((h) => (
              <div key={h.id} className="flex items-center gap-3 flex-wrap text-xs border border-gray-200 rounded-lg px-3 py-2">
                <span className="text-gray-400 w-24 shrink-0">{formatarData(h.created_at)}</span>
                <span className="flex-1 min-w-40 font-medium text-gray-800 truncate">{h.assunto}</span>
                <span className="text-gray-500">
                  {h.enviados} de {h.total}
                  {h.falhas > 0 ? ` · ${h.falhas} falha${h.falhas === 1 ? "" : "s"}` : ""}
                </span>
                <span
                  className={`text-[10px] font-bold rounded-full px-2 py-0.5 border ${
                    h.status === "concluido" ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}
                >
                  {h.status === "concluido" ? "Concluído" : h.status === "pausado" ? "Pausado" : "Interrompido"}
                </span>
                {h.status !== "concluido" && (
                  <button
                    type="button"
                    onClick={() => continuarEnvio(h.id)}
                    disabled={ocupado !== null}
                    className="text-[11px] font-semibold text-primary border border-primary/40 rounded-lg px-2.5 py-1 hover:bg-primary/5 disabled:opacity-50"
                  >
                    Continuar envio
                  </button>
                )}
                {h.motivo_pausa && h.status === "pausado" && <span className="basis-full text-[10px] text-amber-700">{h.motivo_pausa}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
