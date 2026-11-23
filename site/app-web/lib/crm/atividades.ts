// CRM do cliente — partes que valem para o navegador e para o servidor (sem banco).
//
// Regra de ouro: todo contato termina com a PRÓXIMA ATIVIDADE agendada (ou um motivo para não ter). A atividade
// nasce dentro de "Contatos e notas" e aparece na Agenda do administrativo e do corretor.

export const TIPOS_CONTATO_CRM = ["WhatsApp", "Ligação", "E-mail", "Instagram", "Facebook", "Reunião", "Visita", "Nota"];

export const TIPOS_ATIVIDADE_CRM = ["Ligar", "WhatsApp", "E-mail", "Instagram", "Facebook", "Visita", "Reunião", "Enviar proposta", "Simulação de financiamento", "Avaliação do imóvel", "Outro"];

// Tipo de contato que fica registrado quando a atividade é concluída.
export const CONTATO_DA_ATIVIDADE: Record<string, string> = {
  Ligar: "Ligação",
  WhatsApp: "WhatsApp",
  "E-mail": "E-mail",
  Instagram: "Instagram",
  Facebook: "Facebook",
  Visita: "Visita",
  Reunião: "Reunião"
};

// Atividade sugerida depois de cada tipo de contato (o que normalmente vem a seguir).
export const ATIVIDADE_SUGERIDA: Record<string, string> = {
  WhatsApp: "Ligar",
  Ligação: "WhatsApp",
  "E-mail": "Ligar",
  Instagram: "WhatsApp",
  Facebook: "WhatsApp",
  Reunião: "Ligar",
  Visita: "Ligar",
  Nota: "Ligar"
};

export const ATALHOS_DE_DATA = [
  { rotulo: "Amanhã", dias: 1 },
  { rotulo: "+2 dias", dias: 2 },
  { rotulo: "+7 dias", dias: 7 },
  { rotulo: "+15 dias", dias: 15 },
  { rotulo: "+30 dias", dias: 30 },
  { rotulo: "+60 dias", dias: 60 }
];

export const MOTIVOS_SEM_PROXIMA_ATIVIDADE = [
  "Cliente pediu para não ser contatado",
  "Negócio fechado, sem pendência",
  "Número ou contato inválido",
  "Outro motivo"
];

export const TEMPERATURAS: Record<string, { rotulo: string; icone: string; cor: string }> = {
  quente: { rotulo: "Quente", icone: "🔥", cor: "bg-red-50 text-red-700 border-red-200" },
  morno: { rotulo: "Morno", icone: "🌤", cor: "bg-amber-50 text-amber-700 border-amber-200" },
  frio: { rotulo: "Frio", icone: "❄️", cor: "bg-sky-50 text-sky-700 border-sky-200" },
  nao_quer: { rotulo: "Não quer contato", icone: "⛔", cor: "bg-gray-100 text-gray-600 border-gray-300" }
};

// "2026-11-23" + n dias -> "2026-11-26" (dia de calendário, sem fuso).
export function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export type AtividadeCliente = {
  id: string;
  tipo: string;
  titulo: string;
  data: string; // yyyy-mm-dd
  hora: string | null;
  responsavelId: string | null;
  responsavelNome: string | null;
  feito: boolean;
  feitoEm: string | null;
  origem: string;
};

export type CrmCliente = {
  temperatura: string | null;
  optOut: boolean;
  optOutEm: string | null;
  optOutMotivo: string | null;
  telefoneInvalido: boolean;
  instagram: string | null;
  facebook: string | null;
  fonteDado: string | null;
};

export const CRM_VAZIO: CrmCliente = { temperatura: null, optOut: false, optOutEm: null, optOutMotivo: null, telefoneInvalido: false, instagram: null, facebook: null, fonteDado: null };

// Link para abrir o perfil: aceita @usuario, usuario, endereço sem "https" (facebook.com/fulano) ou o link completo.
function comoLink(valor: string | null, dominio: RegExp, base: string): string | null {
  const v = (valor ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (dominio.test(v)) return `https://${v.replace(/\/+$/, "")}`;
  return `${base}${v.replace(/^@/, "").replace(/\/+$/, "")}`;
}

export function linkInstagram(valor: string | null): string | null {
  return comoLink(valor, /^(www\.)?(instagram\.com|instagr\.am)\//i, "https://instagram.com/");
}

export function linkFacebook(valor: string | null): string | null {
  return comoLink(valor, /^(www\.|m\.)?(facebook\.com|fb\.com|fb\.me)\//i, "https://facebook.com/");
}
