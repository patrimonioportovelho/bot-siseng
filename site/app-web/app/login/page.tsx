import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { loginAction, criarMensagemSacAction } from "./actions";
import { loginPortalViaSiteAction } from "@/app/portal/actions";
import { AdminLoginPanel } from "@/components/site/admin-login-panel";
import { PortalLoginPanel } from "@/components/site/portal-login-panel";
import { ShareButton } from "@/components/site/share-button";
import { PublicacaoCard } from "@/components/site/publicacao-card";
import { EventoCard } from "@/components/site/evento-card";
import { RankingHonorarios } from "@/components/site/ranking-honorarios";
import { proximaOcorrencia } from "@/lib/eventos/ocorrencias";
import { buscarRankingHonorariosMes } from "@/lib/parceiros/ranking-honorarios";

export const dynamic = "force-dynamic";

const SERVICOS = [
  {
    titulo: "Correspondência Bancária",
    descricao: "Assessoria completa em financiamento imobiliário, da simulação até a assinatura do contrato com o banco."
  },
  {
    titulo: "Administração de Imóveis",
    descricao: "Cuidamos do imóvel alugado do início ao fim: contrato, repasses, vistorias e atendimento ao inquilino."
  },
  {
    titulo: "Serviços de Regularização",
    descricao: "Documentação, matrícula e regularização junto aos cartórios e órgãos públicos, sem dor de cabeça pra você."
  },
  {
    titulo: "Compra e Venda",
    descricao: "Da avaliação à assinatura: te acompanhamos em cada etapa da compra ou venda do seu imóvel."
  }
];

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{
    erro?: string;
    next?: string;
    sac_ok?: string;
    sac_erro?: string;
    erro_portal?: string;
    email_portal?: string;
  }>;
}) {
  const { erro, next, sac_ok, sac_erro, erro_portal, email_portal } = await searchParams;

  // Ranking de honorários do mês (29/08/2026) — pedido do usuário, ver
  // lib/parceiros/ranking-honorarios.ts. RankingHonorarios já não renderiza
  // nada quando ninguém recebeu honorário ainda no mês (normal logo no
  // início do mês, antes de qualquer repasse ser marcado como pago).
  const rankingHonorarios = await buscarRankingHonorariosMes();

  const publicacoes = await prisma.publicacoes_site.findMany({
    // Checklist é conteúdo interno (só circula no Portal do Corretor e por
    // link direto mandado pelo corretor) — nunca aparece no mural público.
    where: { ativo: true, tipo: { not: "Checklist" } },
    orderBy: { publicado_em: "desc" },
    // Mural público mostra só as 9 mais recentes (3 linhas de 3 no grid
    // lg:grid-cols-3 abaixo) — pedido do usuário pra não virar uma lista
    // infinita na home pública.
    take: 9
  });

  // Eventos públicos (visibilidade "Publico") já dentro da janela de
  // publicação — junto com notícias/editais, seção própria, como pedido
  // ("preciso que esses eventos seja publico na pagina externa junto com
  // noticias, editais"). Só os que ainda vão acontecer (ou ainda estão
  // recorrendo); eventos passados somem sozinhos da home.
  //
  // Fase 6 (12/08/2026): também entra aqui evento "fechado" pra equipe
  // (Interno etc., presença só de Administrativo/Corretor/Corretor
  // Estagiário) que tenha inscrição de convidado aberta (
  // formulario_inscricao != null) — mesmo raciocínio de app/evento/[id]/
  // page.tsx#buscarEventoPublico: quem confirma presença fica restrito à
  // equipe, mas convidado externo (não-parceiro) precisa achar a página de
  // inscrição/pagamento por fora, sem precisar de link direto mandado na
  // mão.
  const agora = new Date();
  const eventosBrutos = await prisma.eventos.findMany({
    where: {
      excluido: false,
      ativo: true,
      publicado_em: { lte: agora },
      OR: [{ visibilidade: "Publico" }, { formulario_inscricao: { not: null } }]
    },
    orderBy: { data_inicio: "asc" },
    take: 30
  });
  const eventos = eventosBrutos
    .map((ev) => ({ ev, proxima: proximaOcorrencia(ev.data_inicio, ev.recorrencia, ev.recorrencia_ate, agora) }))
    .filter((x): x is { ev: (typeof eventosBrutos)[number]; proxima: Date } => x.proxima !== null)
    .sort((a, b) => a.proxima.getTime() - b.proxima.getTime())
    .slice(0, 6);

  // Link absoluto (com domínio) pra dar pra compartilhar notícia/edital ou o
  // SAC direto — link relativo não funciona quando compartilhado fora do site
  // (WhatsApp, etc.).
  const host = (await headers()).get("host");
  const baseUrl = `${host?.includes("localhost") ? "http" : "https"}://${host}`;

  return (
    <div className="min-h-screen bg-appbg">
      {/* Header */}
      <header className="bg-primary">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-192.png" alt="SisEng" className="h-10 w-10" />
            <div className="text-white/60 text-[11px]">sistema interno</div>
          </div>
          <div className="flex items-center gap-2">
            <PortalLoginPanel action={loginPortalViaSiteAction} erro={erro_portal} emailInicial={email_portal} />
            <AdminLoginPanel action={loginAction} erro={erro} next={next} />
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-primary">
        <div className="max-w-5xl mx-auto px-4 pb-16 pt-6 text-center">
          <h1 className="text-white text-3xl md:text-4xl font-extrabold leading-tight max-w-3xl mx-auto">
            O imóvel certo começa com quem entende do assunto.
          </h1>
          <p className="text-white/70 text-sm md:text-base mt-4 max-w-2xl mx-auto">
            Compra, venda, locação e administração de imóveis em Porto Velho e região — com a
            confiança de quem cuida de cada etapa do início ao fim.
          </p>
          <div className="flex items-center justify-center gap-3 mt-6">
            <a
              href="#servicos"
              className="text-sm bg-white text-primary rounded-lg px-5 py-2.5 font-semibold hover:opacity-90 transition-opacity"
            >
              Nossos serviços
            </a>
            <a
              href="#sac"
              className="text-sm bg-transparent border border-white/40 text-white rounded-lg px-5 py-2.5 font-semibold hover:bg-white/10 transition-colors"
            >
              Fale conosco
            </a>
          </div>
        </div>
      </section>

      <main className="max-w-5xl mx-auto px-4">
        {/* Serviços */}
        <section id="servicos" className="-mt-10 mb-16">
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
            {SERVICOS.map((s) => (
              <div key={s.titulo} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="text-sm font-bold text-gray-800 mb-2">{s.titulo}</div>
                <p className="text-xs text-gray-500 leading-relaxed">{s.descricao}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Notícias e editais */}
        <section id="noticias" className="mb-16">
          <div className="text-xl font-bold text-gray-800 mb-1">Notícias e editais</div>
          <p className="text-xs text-gray-500 mb-4">Novidades da imobiliária e publicações oficiais.</p>

          {publicacoes.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-400">
              Em breve, novidades por aqui.
            </div>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {publicacoes.map((p) => (
              <PublicacaoCard key={p.id} publicacao={p} baseUrl={baseUrl} />
            ))}
          </div>
        </section>

        {/* Eventos */}
        {eventos.length > 0 && (
          <section id="eventos" className="mb-16">
            <div className="text-xl font-bold text-gray-800 mb-1">Eventos</div>
            <p className="text-xs text-gray-500 mb-4">Reuniões, treinamentos e outros eventos abertos ao público.</p>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {eventos.map(({ ev, proxima }) => (
                <EventoCard
                  key={ev.id}
                  evento={{
                    id: ev.id,
                    tipo: ev.tipo,
                    nome: ev.nome,
                    local: ev.local,
                    imagem_url: ev.imagem_url,
                    dataExibida: proxima,
                    recorrencia: ev.recorrencia,
                    horario_inicio: ev.horario_inicio
                  }}
                  baseUrl={baseUrl}
                />
              ))}
            </div>
          </section>
        )}

        <RankingHonorarios ranking={rankingHonorarios} />

        {/* SAC */}
        <section id="sac" className="mb-16">
          <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-xl mx-auto">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="text-lg font-bold text-gray-800">Fale conosco (SAC)</div>
              <ShareButton
                url={`${baseUrl}/login#sac`}
                title="Fale conosco — RE/MAX Engimob"
                text="Dúvidas, sugestões ou reclamações — fale com a RE/MAX Engimob."
              />
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Dúvidas, sugestões ou reclamações — nossa equipe responde o quanto antes.
            </p>

            {sac_ok === "1" && (
              <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                Mensagem enviada com sucesso. Obrigado pelo contato!
              </div>
            )}
            {sac_erro && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                {sac_erro}
              </div>
            )}

            <form action={criarMensagemSacAction} className="flex flex-col gap-3">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Nome</label>
                  <input
                    name="nome"
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
                    placeholder="Seu nome"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">E-mail</label>
                  <input
                    name="email"
                    type="email"
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
                    placeholder="seuemail@exemplo.com"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Telefone (opcional)</label>
                  <input
                    name="telefone"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
                    placeholder="(69) 99999-9999"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Assunto (opcional)</label>
                  <input
                    name="assunto"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
                    placeholder="Sobre o que é?"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">Mensagem</label>
                <textarea
                  name="mensagem"
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary min-h-28"
                  placeholder="Como podemos ajudar?"
                />
              </div>
              <button
                type="submit"
                className="bg-primary text-white rounded-lg py-2.5 text-sm font-semibold hover:opacity-90 mt-1"
              >
                Enviar mensagem
              </button>
            </form>
          </div>
        </section>
      </main>

      <footer className="bg-[color:var(--pri-dark)]">
        <div className="max-w-5xl mx-auto px-4 py-6 text-center text-white/50 text-[11px]">
          RE/MAX Engimob · Porto Velho/RO — SisEng, sistema interno de gestão.
        </div>
      </footer>
    </div>
  );
}
