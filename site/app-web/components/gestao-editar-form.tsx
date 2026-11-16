"use client";

import { useState } from "react";
import { formatValorEditavel, formatPercentual } from "@/lib/format";
import { BotaoSubmit } from "@/components/botao-submit";
import { COLUNAS_KANBAN, CHAVE_POSSE, CHAVE_POSSE_LABEL } from "@/lib/gestoes/opcoes";
import { AdicionarProprietarioImovel } from "@/components/adicionar-proprietario-imovel";
import { ConfirmarAnuncioModal } from "@/components/confirmar-anuncio-modal";
import type { AnuncioInformado } from "@/lib/gestoes/anuncio";

type ParceiroOpcao = { id: string; nome: string };
type ClienteOpcao = { id: string; nome: string; id_legado: string | null; parceiro_id: string | null };

type GestaoExistente = {
  id: string;
  parceiro_id: string | null;
  valor_venda: unknown;
  porc_honorario: unknown;
  prazo_gestao_dias: number | null;
  data_assinatura: Date | null;
  chave_posse: string;
  chave_com: string | null;
  coluna: string;
};

function inputDate(d: Date | null) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

const CAMPO = "text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-full outline-none focus:border-primary bg-white";
const LABEL = "text-xs text-gray-600 block mb-1";

// Ficha de edição da Gestão — mesmo padrão visual do ManutencaoEditarForm,
// mas com os campos do contrato de gestão em vez dos campos de manutenção.
// Cliente principal e Imóvel não são editáveis aqui (mostrados só como
// leitura no cabeçalho da página) — nasceram do formulário do portal e
// mudar o vínculo é raro o bastante pra não precisar de UI dedicada agora.
export function GestaoEditarForm({
  gestao,
  parceiros,
  clientes,
  proprietariosAtuais,
  imovel,
  action
}: {
  gestao: GestaoExistente;
  // Anúncio do imóvel no site (cadastro do imóvel) — pedido ao mandar a etapa para Comercialização.
  imovel: { endereco: string | null; anuncio_id: string | null; anuncio_url: string | null };
  parceiros: ParceiroOpcao[];
  clientes: ClienteOpcao[];
  proprietariosAtuais: { id: string; nome: string }[];
  action: (formData: FormData) => void;
}) {
  const g = gestao;
  const [chavePosse, setChavePosse] = useState(g.chave_posse);
  const [coluna, setColuna] = useState(g.coluna);
  const [pedindoAnuncio, setPedindoAnuncio] = useState(false);
  const [anuncio, setAnuncio] = useState<AnuncioInformado | null>(null);
  const indoParaComercializacao = coluna === "comercializacao" && g.coluna !== "comercializacao";

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="gestaoId" value={g.id} />
      {indoParaComercializacao && anuncio && (
        <>
          <input type="hidden" name="anuncio_resposta" value={anuncio.anunciado ? "sim" : "nao"} />
          <input type="hidden" name="anuncio_id" value={anuncio.anunciado ? anuncio.id : ""} />
          <input type="hidden" name="anuncio_url" value={anuncio.anunciado ? anuncio.url : ""} />
        </>
      )}
      {pedindoAnuncio && (
        <ConfirmarAnuncioModal
          endereco={imovel.endereco ?? "Imóvel"}
          inicial={{ id: imovel.anuncio_id, url: imovel.anuncio_url }}
          aoConfirmar={(a) => {
            setAnuncio(a);
            setColuna("comercializacao");
            setPedindoAnuncio(false);
          }}
          aoCancelar={() => setPedindoAnuncio(false)}
        />
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Contrato</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Etapa (quadro)</label>
            <select
              className={CAMPO}
              name="coluna"
              value={coluna}
              onChange={(e) => {
                const nova = e.target.value;
                // Indo para Comercialização, abre antes a janela "Imóvel já anunciado no site?" (a etapa só muda ao confirmar).
                if (nova === "comercializacao" && g.coluna !== "comercializacao") {
                  setPedindoAnuncio(true);
                  return;
                }
                setColuna(nova);
                setAnuncio(null);
              }}
            >
              {COLUNAS_KANBAN.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Corretor responsável</label>
            <select className={CAMPO} name="parceiro_id" defaultValue={g.parceiro_id ?? ""}>
              <option value="">—</option>
              {parceiros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Valor de venda (R$)</label>
            <input className={CAMPO} name="valor_venda" placeholder="350.000,00" defaultValue={formatValorEditavel(g.valor_venda)} />
          </div>
          <div>
            <label className={LABEL}>Porcentagem honorários (%)</label>
            <input className={CAMPO} name="porc_honorario" placeholder="6" defaultValue={formatPercentual(g.porc_honorario)} />
          </div>
          <div>
            <label className={LABEL}>Prazo da gestão (dias)</label>
            <input className={CAMPO} name="prazo_gestao_dias" placeholder="90" defaultValue={g.prazo_gestao_dias ?? ""} />
          </div>
          <div>
            <label className={LABEL}>Data de assinatura</label>
            <input type="date" className={CAMPO} name="data_assinatura" defaultValue={inputDate(g.data_assinatura)} />
          </div>
        </div>

        {(imovel.anuncio_id || indoParaComercializacao) && (
          <div className="mt-3 text-[11px] text-gray-600">
            Anúncio no site:{" "}
            {indoParaComercializacao && anuncio ? (
              anuncio.anunciado ? (
                <span className="font-semibold text-green-700">{anuncio.id} (será salvo ao salvar a ficha)</span>
              ) : (
                <span className="font-semibold text-amber-700">não anunciado (será salvo ao salvar a ficha)</span>
              )
            ) : (
              <span className="font-semibold text-green-700">
                {imovel.anuncio_id}
                {imovel.anuncio_url && (
                  <>
                    {" · "}
                    <a href={imovel.anuncio_url} target="_blank" rel="noreferrer" className="text-primary underline">
                      Abrir anúncio ↗
                    </a>
                  </>
                )}
              </span>
            )}
          </div>
        )}

        <div className="mt-3 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          <div className="text-[11px] text-blue-700 font-semibold mb-1.5">Proprietário(s) do imóvel</div>
          {/* Só adiciona — se o corretor esqueceu um co-titular (cônjuge,
              herdeiro etc.), o admin completa aqui sem sair da tela. Pra
              remover um proprietário existente, é preciso ir em Imóveis. */}
          <AdicionarProprietarioImovel proprietariosAtuais={proprietariosAtuais} clientesDisponiveis={clientes} />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Chave</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Posse da chave</label>
            <select className={CAMPO} name="chave_posse" value={chavePosse} onChange={(e) => setChavePosse(e.target.value)}>
              {CHAVE_POSSE.map((c) => (
                <option key={c} value={c}>
                  {CHAVE_POSSE_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          {chavePosse !== "imobiliaria" && (
            <div>
              <label className={LABEL}>Com quem (nome)</label>
              <input className={CAMPO} name="chave_com" defaultValue={g.chave_com ?? ""} placeholder="Ex.: João (corretor)" />
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <BotaoSubmit carregandoTexto="Salvando..." className="text-xs bg-primary text-white rounded-lg px-5 py-2 font-semibold">
          Salvar alterações
        </BotaoSubmit>
      </div>
    </form>
  );
}
