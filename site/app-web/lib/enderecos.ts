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

// Busca automática de CEP via ViaCEP — chamada direto do navegador (sem
// passar pelo nosso servidor). Devolve null em qualquer situação de CEP
// não encontrado/erro de rede, para o formulário simplesmente não
// preencher nada automaticamente (usuário sempre pode digitar manual).
export async function buscarCep(cep: string): Promise<CepEncontrado | null> {
  const d = cep.replace(/\D/g, "");
  if (d.length !== 8) return null;
  try {
    const resp = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    if (!resp.ok) return null;
    const json = await resp.json();
    if (json?.erro) return null;
    return {
      cep: d,
      logradouro: String(json.logradouro ?? ""),
      bairro: String(json.bairro ?? ""),
      localidade: String(json.localidade ?? ""),
      uf: String(json.uf ?? "")
    };
  } catch {
    return null;
  }
}
