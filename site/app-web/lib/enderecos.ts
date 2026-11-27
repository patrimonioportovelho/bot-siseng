// Mapa de sigla (UF) para nome completo do estado — usado só para casar a
// resposta da busca automática de CEP (ViaCEP, que devolve a UF em sigla,
// ex. "RO") com a tabela `estados` do banco, que guarda o nome completo
// (ex. "Rondônia"). Não existe em nenhum outro lugar do sistema hoje.
export const UF_PARA_ESTADO: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins"
};

export type CepEncontrado = {
  cep: string;
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
};

// Busca automática de CEP, direto do navegador (sem passar pelo nosso servidor): primeiro o ViaCEP e, se ele não
// conhecer o CEP ou estiver fora do ar, a BrasilAPI (que às vezes devolve só cidade e estado). Só o número do CEP é
// enviado. Devolve null quando nenhuma das duas acha; o usuário sempre pode digitar o endereço à mão.
// Cada fonte tem 6s de limite, para o campo nunca ficar "carregando" sem fim.
async function consultar(url: string): Promise<Record<string, unknown> | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(6_000) });
    return resp.ok ? await resp.json() : null;
  } catch {
    return null;
  }
}

export async function buscarCep(cep: string): Promise<CepEncontrado | null> {
  const d = cep.replace(/\D/g, "");
  if (d.length !== 8) return null;
  const texto = (v: unknown) => String(v ?? "");

  const via = await consultar(`https://viacep.com.br/ws/${d}/json/`);
  if (via && !via.erro) return { cep: d, logradouro: texto(via.logradouro), bairro: texto(via.bairro), localidade: texto(via.localidade), uf: texto(via.uf) };

  const br = await consultar(`https://brasilapi.com.br/api/cep/v2/${d}`);
  if (br && br.city && br.state) return { cep: d, logradouro: texto(br.street), bairro: texto(br.neighborhood), localidade: texto(br.city), uf: texto(br.state) };
  return null;
}
