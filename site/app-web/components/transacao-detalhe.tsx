"use client";

import { useState } from "react";
import Link from "next/link";
import { TransacaoForm } from "@/components/transacao-form";
import { PainelLateral } from "@/components/painel-lateral";
import { formatMoeda, formatPercentual, formatDataCalendario, formatValorEditavel } from "@/lib/format";

type ClienteOpcao = { id: string; nome: string; id_legado: string | null; parceiroId: string | null };
type LojaOpcao = { id: string; nome: string };
type ParceiroOpcao = { id: string; nome: string; funcao: string | null };
type ImovelOpcao = {
  id: string;
  id_legado: string | null;
  endereco: string | null;
  inscricao: string | null;
  parceiroId: string | null;
  proprietarios: { id: string; nome: string; parceiroId: string | null }[];
};
type AdministracaoOpcao = {
  id: string;
  id_legado: string | null;
  parceiroId: string | null;
  imovelId: string;
  imovelEndereco: string | null;
  imovelInscricao: string | null;
  clienteNome: string;
};
type CondicaoPagamento = {
  tipo: string;
  valor: string;
  forma_pagamento: string;
  parcelas: string;
  momento: string;
  data_pagamento: string;
  descricao: string;
};

type PessoaLink = { id: string; nome: string };

type TransacaoParaVisualizar = {
  id: string;
  id_legado: string | null;
  tipo: string;
  loja_id: string;
  imovel_id: string | null;
  adm_imovel_id: string | null;
  status: string | null;
  garantia: string | null;
  valor_caucao: unknown;
  pg_caucao: string | null;
  data_assinatura: Date | null;
  data_vencimento: Date | null;
  dia_vencimento: number | null;
  prazo_contrato_meses: number | null;
  tem_parceria: boolean;
  porc_parceria: unknown;
  parceiro_externo_id: string | null;
  corretor_proprietario_id: string | null;
  corretor_contraparte_id: string | null;
  status_honorario: string;
  valor_transacao: unknown;
  porc_honorario: unknown;
  porc_corretor_proprietario: unknown;
  porc_corretor_contraparte: unknown;
  porc_imobiliaria: unknown;
  encargos: string[];
  iptu: unknown;
  trsd: unknown;
  forma_pagamento: string | null;
  finalidade_locacao: string | null;
  chave: string | null;
  tem_vistoria: boolean | null;
  arquivo_vistoria_url: string | null;
  observacao: string | null;
  pasta_url: string | null;
};

// Rótulo em cima (cinza claro), valor embaixo — mesmo padrão já usado no
// detalhe de Movimentação (app/financeiro/[id]/page.tsx) pra ficha de
// conferência somente-leitura.
function Campo({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className="text-xs text-gray-800 mt-0.5">{valor}</div>
    </div>
  );
}

function LinkNovaAba({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} target="_blank" rel="noreferrer" className="text-primary font-semibold hover:underline">
      {children}
    </Link>
  );
}

// Imóvel/Administração/Cliente ficam num botão que abre o painel lateral
// (drawer) em vez de navegar pra outra aba — pedido do usuário: conferir e
// editar rápido sem sair do detalhe da transação.
function BotaoPainel({
  href,
  titulo,
  onAbrir,
  children
}: {
  href: string;
  titulo: string;
  onAbrir: (href: string, titulo: string) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onAbrir(href, titulo)}
      className="text-primary font-semibold hover:underline text-left"
    >
      {children}
    </button>
  );
}

export function TransacaoDetalhe({
  transacao,
  lojaNome,
  imovelInfo,
  administracaoInfo,
  proprietarios,
  interessados,
  corretorProprietario,
  corretorContraparte,
  parceiroExterno,
  condicoesPagamento,
  lojas,
  clientes,
  imoveis,
  parceiros,
  administracoes,
  imoveisComAdmAtivaIds,
  interessadosIniciais,
  condicoesIniciais,
  action
}: {
  transacao: TransacaoParaVisualizar;
  lojaNome: string;
  imovelInfo: { id: string; label: string } | null;
  administracaoInfo: { id: string; label: string } | null;
  proprietarios: PessoaLink[];
  interessados: PessoaLink[];
  corretorProprietario: string | null;
  corretorContraparte: string | null;
  parceiroExterno: string | null;
  condicoesPagamento: CondicaoPagamento[];
  lojas: LojaOpcao[];
  clientes: ClienteOpcao[];
  imoveis: ImovelOpcao[];
  parceiros: ParceiroOpcao[];
  administracoes: AdministracaoOpcao[];
  imoveisComAdmAtivaIds: string[];
  interessadosIniciais: ClienteOpcao[];
  condicoesIniciais: CondicaoPagamento[];
  action: (formData: FormData) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [painel, setPainel] = useState<{ href: string; titulo: string } | null>(null);

  function abrirPainel(href: string, titulo: string) {
    setPainel({ href: `${href}${href.includes("?") ? "&" : "?"}embed=1`, titulo });
  }

  const t = transacao;
  const eLocacao = t.tipo === "Locação";

  if (editando) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-gray-800">Editando transação</div>
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="text-xs text-gray-500 hover:text-gray-800 underline"
          >
            Cancelar
          </button>
        </div>
        <TransacaoForm
          transacao={t}
          lojas={lojas}
          clientes={clientes}
          imoveis={imoveis}
          parceiros={parceiros}
          administracoes={administracoes}
          imoveisComAdmAtivaIds={imoveisComAdmAtivaIds}
          interessadosIniciais={interessadosIniciais}
          condicoesIniciais={condicoesIniciais}
          action={action}
        />
      </div>
    );
  }

  const honorarioTotalRS = Number(t.valor_transacao ?? 0) * (Number(t.porc_honorario ?? 0) || 0);
  const valorParceriaRS = t.tem_parceria ? honorarioTotalRS * (Number(t.porc_parceria ?? 0) || 0) : 0;
  const restanteRateioRS = honorarioTotalRS - valorParceriaRS;
  const valorCorretorProprietarioRS = restanteRateioRS * (Number(t.porc_corretor_proprietario ?? 0) || 0);
  const valorCorretorContraparteRS = restanteRateioRS * (Number(t.porc_corretor_contraparte ?? 0) || 0);
  const valorImobiliariaRS = restanteRateioRS * (Number(t.porc_imobiliaria ?? 0) || 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-gray-800">Identificação</div>
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-semibold"
          >
            Editar
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3 md:gap-4">
          <Campo label="Tipo de transação" valor={t.tipo} />
          <Campo label="Loja" valor={lojaNome || "—"} />
          <Campo label="Status" valor={t.status || "—"} />
          <Campo
            label="Pasta (link)"
            valor={t.pasta_url ? <LinkNovaAba href={t.pasta_url}>Abrir pasta →</LinkNovaAba> : "—"}
          />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Vínculo</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-4">
          <Campo
            label={administracaoInfo ? "Administração (status Ativo)" : "Imóvel"}
            valor={
              administracaoInfo ? (
                <BotaoPainel
                  href={`/administracoes/${administracaoInfo.id}`}
                  titulo={`Administração — ${administracaoInfo.label}`}
                  onAbrir={abrirPainel}
                >
                  {administracaoInfo.label}
                </BotaoPainel>
              ) : imovelInfo ? (
                <BotaoPainel href={`/imoveis/${imovelInfo.id}`} titulo={`Imóvel — ${imovelInfo.label}`} onAbrir={abrirPainel}>
                  {imovelInfo.label}
                </BotaoPainel>
              ) : (
                "—"
              )
            }
          />
          <Campo
            label={`Cliente Proprietário${proprietarios.length > 1 ? "s" : ""}`}
            valor={
              proprietarios.length > 0 ? (
                <span className="flex flex-wrap gap-x-1">
                  {proprietarios.map((p, i) => (
                    <span key={p.id}>
                      <BotaoPainel href={`/clientes/${p.id}`} titulo={`Cliente — ${p.nome}`} onAbrir={abrirPainel}>
                        {p.nome}
                      </BotaoPainel>
                      {i < proprietarios.length - 1 ? "," : ""}
                    </span>
                  ))}
                </span>
              ) : (
                "—"
              )
            }
          />
          <Campo
            label={`Cliente Interessado${interessados.length > 1 ? "s" : ""} (a outra parte)`}
            valor={
              interessados.length > 0 ? (
                <span className="flex flex-wrap gap-x-1">
                  {interessados.map((c, i) => (
                    <span key={c.id}>
                      <BotaoPainel href={`/clientes/${c.id}`} titulo={`Cliente — ${c.nome}`} onAbrir={abrirPainel}>
                        {c.nome}
                      </BotaoPainel>
                      {i < interessados.length - 1 ? "," : ""}
                    </span>
                  ))}
                </span>
              ) : (
                "—"
              )
            }
          />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Datas e valor</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3 md:gap-4">
          <Campo label="Data de assinatura" valor={formatDataCalendario(t.data_assinatura)} />
          <Campo label="Valor da transação" valor={formatMoeda(t.valor_transacao)} />
          {eLocacao && <Campo label="Dia de vencimento (aluguel)" valor={t.dia_vencimento ?? "—"} />}
          {eLocacao && <Campo label="Tempo de contrato (meses)" valor={t.prazo_contrato_meses ?? "—"} />}
          {eLocacao && <Campo label="Data de vencimento (fim do contrato)" valor={formatDataCalendario(t.data_vencimento)} />}
        </div>
      </div>

      {eLocacao && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">Locação</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3 md:gap-4">
            <Campo label="Finalidade da locação" valor={t.finalidade_locacao || "—"} />
            <Campo label="Garantia" valor={t.garantia || "—"} />
            <Campo label="Valor da caução" valor={t.valor_caucao != null ? formatMoeda(t.valor_caucao) : "—"} />
            <Campo label="Forma de pagamento da caução" valor={t.pg_caucao || "—"} />
            <Campo label="Forma de pagamento" valor={t.forma_pagamento || "—"} />
            <Campo
              label="Encargos"
              valor={
                t.encargos.length > 0 ? (
                  <ul className="flex flex-col gap-0.5">
                    {t.encargos.map((op) => (
                      <li key={op}>
                        {op}
                        {op === "IPTU do ano vigente ao andamento do contrato" && t.iptu != null && (
                          <span className="text-gray-500"> — {formatMoeda(t.iptu)}</span>
                        )}
                        {op === "TRSD do ano vigente ao andamento do contrato" && t.trsd != null && (
                          <span className="text-gray-500"> — {formatMoeda(t.trsd)}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  "—"
                )
              }
            />
          </div>
        </div>
      )}

      {!eLocacao && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-3">Compra e venda</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-4 mb-3">
            <Campo label="Momento da entrega das chaves" valor={t.chave || "—"} />
          </div>
          {condicoesPagamento.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {condicoesPagamento.map((c, i) => (
                <div key={i} className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <span className="font-semibold text-gray-800">{c.tipo}</span> —{" "}
                  {formatValorEditavel(c.valor) || c.valor}
                  {c.forma_pagamento && <span className="text-gray-500"> · {c.forma_pagamento}</span>}
                  {c.parcelas && <span className="text-gray-500"> · {c.parcelas}x</span>}
                  {c.momento && <span className="text-gray-500"> · {c.momento}</span>}
                  {c.data_pagamento && <span className="text-gray-500"> · {c.data_pagamento}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Comissionamento</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3 md:gap-4">
          <Campo label="Corretor do proprietário" valor={corretorProprietario || "—"} />
          <Campo label="Corretor da contraparte" valor={corretorContraparte || "—"} />
          <Campo label="Status do honorário" valor={t.status_honorario} />
          <Campo
            label="Honorário total"
            valor={`${formatPercentual(t.porc_honorario)}% — ${formatMoeda(honorarioTotalRS)}`}
          />
          {t.tem_parceria && (
            <Campo
              label="Parceria externa"
              valor={`${parceiroExterno || "—"} — ${formatPercentual(t.porc_parceria)}% — ${formatMoeda(valorParceriaRS)}`}
            />
          )}
          <Campo
            label="% corretor do proprietário"
            valor={`${formatPercentual(t.porc_corretor_proprietario)}% — ${formatMoeda(valorCorretorProprietarioRS)}`}
          />
          <Campo
            label="% corretor da contraparte"
            valor={`${formatPercentual(t.porc_corretor_contraparte)}% — ${formatMoeda(valorCorretorContraparteRS)}`}
          />
          <Campo
            label="% imobiliária"
            valor={`${formatPercentual(t.porc_imobiliaria)}% — ${formatMoeda(valorImobiliariaRS)}`}
          />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Vistoria</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-4">
          <Campo label="Tem vistoria?" valor={t.tem_vistoria ? "Sim" : "Não"} />
          <Campo
            label="Arquivo da vistoria"
            valor={t.arquivo_vistoria_url ? <LinkNovaAba href={t.arquivo_vistoria_url}>Abrir arquivo →</LinkNovaAba> : "—"}
          />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-bold text-gray-800 mb-3">Observação</div>
        <p className="text-xs text-gray-800 whitespace-pre-wrap">{t.observacao || "—"}</p>
      </div>

      <PainelLateral
        aberto={painel !== null}
        href={painel?.href ?? null}
        titulo={painel?.titulo ?? ""}
        onFechar={() => setPainel(null)}
      />
    </div>
  );
}
