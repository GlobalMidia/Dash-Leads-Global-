export const LEAD_ORIGINS = [
  "Google Ads",
  "Meta Ads",
  "Orgânico",
  "Recomendação",
  "Não identificado",
] as const;

export type LeadOrigin = (typeof LEAD_ORIGINS)[number];

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export function normalizeLeadOrigin(value: string): LeadOrigin {
  const origin = normalizeText(value);

  if (["google", "adwords", "gclid", "paid search", "cpc"].some((term) => origin.includes(term))) {
    return "Google Ads";
  }
  if (["meta", "facebook", "instagram", "fb ads", "ig ads"].some((term) => origin.includes(term))) {
    return "Meta Ads";
  }
  if (["recomend", "indicacao", "indicado", "referral", "parceiro", "amigo"].some((term) => origin.includes(term))) {
    return "Recomendação";
  }
  if (!origin) return "Não identificado";
  if (["organico", "organic", "seo", "direct", "direto"].some((term) => origin.includes(term))) {
    return "Orgânico";
  }
  return "Não identificado";
}
