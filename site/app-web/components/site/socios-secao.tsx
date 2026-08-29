// Sócios da imobiliária em destaque no dashboard externo (/login), logo
// abaixo do Ranking de honorários — pedido do usuário (29/08/2026). Mesmo
// layout do RankingHonorarios (flex-wrap justify-center): 1 sócio fica
// centralizado, 2 centralizados, 3 alinhados numa fileira igual ao Ranking —
// sem medalha, e com a função dentro da imobiliária abaixo do nome. Cadastro
// em Configurações > Sócios (só ADM) — reaproveita foto/nome do Parceiro
// escolhido, sem upload próprio.

type SocioDashboard = {
  id: string;
  funcao: string;
  parceiros: { nome: string; foto_url: string | null };
};

function primeiroUltimoNome(nomeCompleto: string): { linha1: string; linha2: string | null } {
  const partes = nomeCompleto.trim().split(/\s+/);
  if (partes.length <= 1) return { linha1: nomeCompleto, linha2: null };
  return { linha1: partes[0], linha2: partes.slice(1).join(" ") };
}

function CartaoSocio({ socio }: { socio: SocioDashboard }) {
  const { linha1, linha2 } = primeiroUltimoNome(socio.parceiros.nome);
  return (
    <div className="flex flex-col items-center w-full max-w-[220px] sm:max-w-[280px]">
      <div className="w-full aspect-[4/5] rounded-xl overflow-hidden border border-gray-200 bg-gray-100 shadow-sm">
        {socio.parceiros.foto_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={socio.parceiros.foto_url} alt={socio.parceiros.nome} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-gray-300">
            {socio.parceiros.nome.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="w-full text-center mt-3 leading-tight break-words">
        <div className="text-base font-bold text-gray-800">{linha1}</div>
        {linha2 && <div className="text-base font-bold text-gray-800">{linha2}</div>}
        <div className="text-xs text-gray-500 mt-0.5">{socio.funcao}</div>
      </div>
    </div>
  );
}

export function SociosSecao({ socios }: { socios: SocioDashboard[] }) {
  if (socios.length === 0) return null;

  return (
    <section id="socios" className="mb-16">
      <div className="text-xl font-bold text-gray-800 mb-1 text-center">Nossos sócios</div>
      <p className="text-xs text-gray-500 mb-6 text-center">Quem está por trás da RE/MAX Engimob.</p>
      <div className="flex flex-wrap justify-center gap-8 sm:gap-12">
        {socios.map((s) => (
          <CartaoSocio key={s.id} socio={s} />
        ))}
      </div>
    </section>
  );
}
