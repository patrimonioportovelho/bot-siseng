"use client";

import { useRef, useState } from "react";
import { prepararUploadImagemEventoAction } from "@/app/eventos/actions";
import { supabaseBrowser, BUCKET_EVENTOS } from "@/lib/supabase-browser";
import { formatValorEditavel } from "@/lib/format";
import {
  TIPOS_EVENTO,
  RECORRENCIA_OPCOES,
  VISIBILIDADE_OPCOES,
  visibilidadeLabel,
  FORMULARIO_INSCRICAO_OPCOES,
  formularioInscricaoLabel
} from "@/lib/eventos/opcoes";

const CAMPO =
  "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

type EventoExistente = {
  id: string;
  nome: string;
  tipo: string | null;
  descricao: string | null;
  local: string | null;
  imagem_url: string | null;
  data_inicio: Date | string;
  recorrencia_ate: Date | string | null;
  horario_inicio: string | null;
  horario_fim: string | null;
  recorrencia: string;
  visibilidade: string;
  portal_corretor: boolean;
  ativo: boolean;
  pago: boolean;
  valor: unknown;
  tem_desconto: boolean;
  valor_desconto: unknown;
  desconto_prazo: Date | string | null;
  organizador_parceiro_id: string | null;
  publicado_em: Date | string | null;
  formulario_inscricao: string | null;
  formulario_interno: boolean;
};

function paraInputDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const data = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(data.getTime())) return "";
  return data.toISOString().slice(0, 10);
}

// Diferente de paraInputDate (data pura, sem hora) — aqui o horário importa
// de verdade (é quando o evento passa a aparecer no mural público/portal).
// BUG CORRIGIDO 10/08/2026: a versão antiga usava getFullYear()/getHours()
// do navegador, que lê o fuso horário CONFIGURADO NO COMPUTADOR de quem
// está usando o sistema — nem sempre é Porto Velho (ex.: máquina com fuso
// UTC ou outro). Isso fazia o campo mostrar (e, ao salvar de novo, gravar)
// um horário errado, sempre com a mesma diferença fixa do horário real de
// Porto Velho. Usa Intl com timeZone explícito, igual
// lib/format.ts#partesHojePortoVelho — não depende do fuso do aparelho.
function paraInputDateTime(d: Date | string | null | undefined): string {
  const data = d ? (typeof d === "string" ? new Date(d) : d) : new Date();
  if (Number.isNaN(data.getTime())) return "";
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Porto_Velho",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(data);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "00";
  return `${valor("year")}-${valor("month")}-${valor("day")}T${valor("hour")}:${valor("minute")}`;
}

// Sempre recorta e redimensiona a capa do evento pra exatamente 1080x1080
// (pedido explícito do usuário, 10/08/2026 — tamanho fixo, sem exceção).
// Recorte central "cover" (usa o maior quadrado possível no meio da
// imagem, sem distorcer) e depois redesenha em 1080x1080. Roda no navegador
// antes do upload, então a capa nunca sai do tamanho padrão nem depende do
// usuário lembrar de redimensionar sozinho antes de escolher o arquivo.
async function paraQuadrado1080(arquivo: File): Promise<File> {
  const bitmap = await createImageBitmap(arquivo);
  const lado = Math.min(bitmap.width, bitmap.height);
  const origemX = (bitmap.width - lado) / 2;
  const origemY = (bitmap.height - lado) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  if (!ctx) return arquivo;
  ctx.drawImage(bitmap, origemX, origemY, lado, lado, 0, 0, 1080, 1080);

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) return arquivo;

  const nomeBase = arquivo.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${nomeBase}.jpg`, { type: "image/jpeg" });
}

// Mesmo esquema de upload direto pro Storage via URL assinada usado nas
// publicações e no Financiamento — a Vercel tem limite fixo de 4,5MB por
// requisição de Server Action, e a capa do evento estoura isso fácil.
export function EventoForm({
  evento,
  organizadores,
  action
}: {
  evento: EventoExistente | null;
  organizadores: { id: string; nome: string }[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const ev = evento;
  const formRef = useRef<HTMLFormElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recorrencia, setRecorrencia] = useState(ev?.recorrencia ?? "Nenhuma");
  const [pago, setPago] = useState(ev?.pago ?? false);
  const [temDesconto, setTemDesconto] = useState(ev?.tem_desconto ?? false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    const form = formRef.current;
    if (!form) return;

    const fileInput = form.elements.namedItem("imagem") as HTMLInputElement | null;
    const arquivo = fileInput?.files?.[0] ?? null;

    setEnviando(true);
    try {
      let imagemCaminho = "";
      if (arquivo) {
        const arquivoQuadrado = await paraQuadrado1080(arquivo);
        const preparo = await prepararUploadImagemEventoAction(arquivoQuadrado.name);
        if (!preparo.ok) throw new Error(preparo.erro);
        const { error: erroUpload } = await supabaseBrowser()
          .storage.from(BUCKET_EVENTOS)
          .uploadToSignedUrl(preparo.caminho, preparo.token, arquivoQuadrado, { contentType: arquivoQuadrado.type });
        if (erroUpload) throw new Error(`Falha ao enviar a imagem: ${erroUpload.message}`);
        imagemCaminho = preparo.caminho;
      }

      const fd = new FormData(form);
      fd.delete("imagem");
      if (imagemCaminho) fd.set("imagem_caminho", imagemCaminho);

      await action(fd);
    } catch (erroEnvio) {
      // BUG CORRIGIDO 10/08/2026: quando a action termina com redirect(...)
      // (sempre que salva com sucesso), o Next lança um erro especial com
      // `digest` começando em "NEXT_REDIRECT" pra sinalizar a navegação —
      // não é uma falha de verdade. Sem esse tratamento, esse catch mostrava
      // a mensagem literal "NEXT_REDIRECT" pro usuário mesmo com o evento já
      // salvo no banco (é o que o usuário reportou como "editei e não
      // atualizou a lista": o save funcionava, só o redirecionamento pra
      // lista é que ficava preso aqui). Repropaga pra deixar o Next navegar.
      if (
        erroEnvio &&
        typeof erroEnvio === "object" &&
        "digest" in erroEnvio &&
        typeof (erroEnvio as { digest?: unknown }).digest === "string" &&
        (erroEnvio as { digest: string }).digest.startsWith("NEXT_REDIRECT")
      ) {
        throw erroEnvio;
      }
      setErro(erroEnvio instanceof Error ? erroEnvio.message : "Falha ao salvar o evento.");
      setEnviando(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-3">
      {ev && <input type="hidden" name="eventoId" value={ev.id} />}

      <div className="grid md:grid-cols-2 gap-2">
        <div>
          <label className={LABEL}>Nome do evento</label>
          <input name="nome" required defaultValue={ev?.nome ?? ""} className={CAMPO} />
        </div>
        <div>
          <label className={LABEL}>Tipo de evento</label>
          <input name="tipo" list="tipos-evento" defaultValue={ev?.tipo ?? ""} className={CAMPO} />
          <datalist id="tipos-evento">
            {TIPOS_EVENTO.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      </div>

      <div>
        <label className={LABEL}>Descrição</label>
        <textarea name="descricao" defaultValue={ev?.descricao ?? ""} className={CAMPO + " min-h-20"} />
      </div>

      <div>
        <label className={LABEL}>Local do evento</label>
        <input name="local" defaultValue={ev?.local ?? ""} className={CAMPO} placeholder="Endereço ou nome do espaço" />
      </div>

      <div className="grid md:grid-cols-3 gap-2">
        <div>
          <label className={LABEL}>Data de realização</label>
          <input
            type="date"
            name="data_inicio"
            required
            defaultValue={paraInputDate(ev?.data_inicio ?? null)}
            className={CAMPO}
          />
        </div>
        <div>
          <label className={LABEL}>Horário de início</label>
          <input type="time" name="horario_inicio" defaultValue={ev?.horario_inicio ?? ""} className={CAMPO} />
        </div>
        <div>
          <label className={LABEL}>Horário de término</label>
          <input type="time" name="horario_fim" defaultValue={ev?.horario_fim ?? ""} className={CAMPO} />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-2 items-end">
        <div>
          <label className={LABEL}>Recorrência</label>
          <select
            name="recorrencia"
            value={recorrencia}
            onChange={(e) => setRecorrencia(e.target.value)}
            className={CAMPO}
          >
            {RECORRENCIA_OPCOES.map((r) => (
              <option key={r} value={r}>
                {r === "Nenhuma" ? "Evento único (não se repete)" : r}
              </option>
            ))}
          </select>
        </div>
        {recorrencia !== "Nenhuma" && (
          <div>
            <label className={LABEL}>Repete até</label>
            <input
              type="date"
              name="recorrencia_ate"
              required
              defaultValue={paraInputDate(ev?.recorrencia_ate ?? null)}
              className={CAMPO}
            />
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-2">
        <div>
          <label className={LABEL}>Visibilidade</label>
          <select name="visibilidade" defaultValue={ev?.visibilidade ?? "Publico"} className={CAMPO}>
            {VISIBILIDADE_OPCOES.map((v) => (
              <option key={v} value={v}>
                {visibilidadeLabel(v)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>Organizador (opcional)</label>
          <select name="organizador_parceiro_id" defaultValue={ev?.organizador_parceiro_id ?? ""} className={CAMPO}>
            <option value="">Sem organizador definido</option>
            {organizadores.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={LABEL}>Agendar publicação para</label>
        <input
          type="datetime-local"
          name="publicado_em"
          defaultValue={paraInputDateTime(ev?.publicado_em ?? null)}
          className={CAMPO}
        />
        <p className="text-[10px] text-gray-400 mt-1">
          Antes desse horário o evento fica publicado só aqui no administrativo — não aparece no mural público nem
          no portal, mesmo marcado como "publicado". Deixe no horário atual pra publicar já.
        </p>
      </div>

      <div className="border border-gray-200 rounded-lg p-3 flex flex-col gap-2">
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" name="pago" checked={pago} onChange={(e) => setPago(e.target.checked)} /> Evento
          tem pagamento
        </label>
        {pago && (
          <div className="grid md:grid-cols-2 gap-2">
            <div>
              <label className={LABEL}>Valor</label>
              <input
                name="valor"
                inputMode="decimal"
                placeholder="0,00"
                defaultValue={formatValorEditavel(ev?.pago ? ev?.valor : null)}
                className={CAMPO}
              />
            </div>
          </div>
        )}
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            name="tem_desconto"
            checked={temDesconto}
            onChange={(e) => setTemDesconto(e.target.checked)}
          />{" "}
          Tem desconto (pagamento adiantado)
        </label>
        {temDesconto && (
          <div className="grid md:grid-cols-2 gap-2">
            <div>
              <label className={LABEL}>Valor com desconto</label>
              <input
                name="valor_desconto"
                inputMode="decimal"
                placeholder="0,00"
                defaultValue={formatValorEditavel(ev?.tem_desconto ? ev?.valor_desconto : null)}
                className={CAMPO}
              />
            </div>
            <div>
              <label className={LABEL}>Desconto válido até</label>
              <input
                type="date"
                name="desconto_prazo"
                defaultValue={paraInputDate(ev?.desconto_prazo ?? null)}
                className={CAMPO}
              />
            </div>
          </div>
        )}
        <p className="text-[10px] text-gray-400">
          Por enquanto isso é só informativo — a cobrança automática (Mercado Pago) entra numa próxima etapa.
        </p>
      </div>

      <div>
        <label className={LABEL}>Foto de capa{ev ? "" : " (opcional)"}</label>
        {ev?.imagem_url && (
          <div className="flex items-center gap-2 mb-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ev.imagem_url} alt="" className="w-14 h-14 rounded-lg object-cover border border-gray-200" />
            <label className="flex items-center gap-1.5 text-xs text-red-600">
              <input type="checkbox" name="remover_imagem" /> Remover imagem atual
            </label>
          </div>
        )}
        <input
          type="file"
          name="imagem"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white file:mr-2 file:text-xs file:border-0 file:bg-gray-100 file:rounded file:px-2 file:py-1"
        />
        <p className="text-[10px] text-gray-400 mt-1">
          A imagem é recortada e redimensionada automaticamente para 1080x1080 — pode enviar em qualquer proporção
          que o sistema ajusta sozinho.
        </p>
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" name="ativo" defaultChecked={ev?.ativo ?? true} /> Evento publicado (visível na lista)
      </label>
      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" name="portal_corretor" defaultChecked={ev?.portal_corretor ?? false} /> Mostrar também
        no perfil/portal do corretor
      </label>

      <div className="border border-gray-200 rounded-lg p-3 flex flex-col gap-2">
        <div className="text-xs font-semibold text-gray-700">Formulários (opcional)</div>
        <div>
          <label className={LABEL}>Inscrição pública (na página do evento)</label>
          <select
            name="formulario_inscricao"
            defaultValue={ev?.formulario_inscricao ?? ""}
            className={CAMPO}
          >
            {FORMULARIO_INSCRICAO_OPCOES.map((f) => (
              <option key={f} value={f}>
                {formularioInscricaoLabel(f)}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-gray-400 mt-1">
            Quando ativo, qualquer pessoa que abrir o link público do evento pode se inscrever preenchendo o
            formulário — nome, e-mail, telefone e quem convidou (o completo pede também endereço, profissão e
            especialidade).
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" name="formulario_interno" defaultChecked={ev?.formulario_interno ?? false} /> Ativar
          formulário interno (leva convidado / quantas pessoas / observações no Portal)
        </label>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{erro}</div>}

      <div>
        <button
          type="submit"
          disabled={enviando}
          className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-60"
        >
          {enviando ? "Enviando..." : ev ? "Salvar alterações" : "Salvar evento"}
        </button>
      </div>
    </form>
  );
}
