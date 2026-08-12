import type { LeadProjectUnit } from "@/types/lead";

export const SITE_EVENT_NAMES = [
  "page_view",
  "engagement_30",
  "engagement_60",
  "scroll_50",
  "scroll_90",
  "cta_click",
  "whatsapp_click",
  "form_view",
  "form_start",
  "form_submit",
  "video_start",
  "video_progress_50",
  "video_complete",
] as const;

export type SiteEventName = (typeof SITE_EVENT_NAMES)[number];

export type SiteJourneyEvent = {
  id: string;
  name: SiteEventName;
  occurredAt: string;
  pageUrl: string;
  pageTitle: string;
  data: Record<string, string>;
};

export type LeadTemperature = "cold" | "warm" | "hot";

export type SiteJourney = {
  score: number;
  temperature: LeadTemperature;
  recommendation: string;
  reasons: string[];
  sessions: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  source: string;
  medium: string;
  campaign: string;
  content: string;
  term: string;
  landingPage: string;
  projectUnit: LeadProjectUnit;
  events: SiteJourneyEvent[];
};

export type JourneyScoreInput = {
  name: SiteEventName;
  sessionId?: string;
};

const EVENT_SCORES: Partial<Record<SiteEventName, number>> = {
  page_view: 1,
  engagement_30: 4,
  engagement_60: 8,
  scroll_50: 3,
  scroll_90: 7,
  cta_click: 10,
  whatsapp_click: 25,
  form_view: 3,
  form_start: 12,
  form_submit: 40,
  video_start: 4,
  video_progress_50: 10,
  video_complete: 16,
};

export function scoreSiteJourney(events: JourneyScoreInput[]) {
  const uniqueEvents = new Set<SiteEventName>();
  const sessions = new Set<string>();

  for (const event of events) {
    uniqueEvents.add(event.name);
    if (event.sessionId) sessions.add(event.sessionId);
  }

  let score = [...uniqueEvents].reduce(
    (total, name) => total + (EVENT_SCORES[name] ?? 0),
    0,
  );
  if (sessions.size > 1) score += Math.min(15, (sessions.size - 1) * 5);
  score = Math.min(100, score);

  const reasons: string[] = [];
  if (uniqueEvents.has("form_submit")) reasons.push("enviou o formulário");
  if (uniqueEvents.has("whatsapp_click")) reasons.push("avançou para o WhatsApp");
  if (uniqueEvents.has("video_complete")) reasons.push("assistiu ao vídeo até o final");
  else if (uniqueEvents.has("video_progress_50")) reasons.push("assistiu mais da metade do vídeo");
  if (uniqueEvents.has("engagement_60")) reasons.push("permaneceu mais de 60 segundos no site");
  if (uniqueEvents.has("scroll_90")) reasons.push("chegou ao final da página");
  if (sessions.size > 1) reasons.push(`retornou ao site em ${sessions.size} sessões`);

  const temperature: LeadTemperature = score >= 70 ? "hot" : score >= 35 ? "warm" : "cold";
  const recommendation =
    temperature === "hot"
      ? "Priorizar o contato: o comportamento indica forte intenção comercial."
      : temperature === "warm"
        ? "Atender com contexto e confirmar necessidade, prazo e capacidade de investimento."
        : "Fazer uma abordagem de descoberta antes de encaminhar uma proposta.";

  return { score, temperature, recommendation, reasons, sessions: sessions.size };
}

export function inferProjectUnit(hostname: string, pathname: string): LeadProjectUnit {
  const value = `${hostname}${pathname}`.toLocaleLowerCase("pt-BR");
  if (value.includes("pme") || value.includes("programa-mundo-empresarial")) return "pme";
  if (value.includes("globalmidia")) return "global";
  return "other";
}

export function inferSiteLeadOrigin(attribution: {
  source?: string;
  medium?: string;
  gclid?: string;
  fbclid?: string;
}) {
  const source = `${attribution.source ?? ""} ${attribution.medium ?? ""}`.toLocaleLowerCase("pt-BR");
  if (attribution.gclid || source.includes("google") || source.includes("cpc")) return "Google Ads" as const;
  if (attribution.fbclid || source.includes("facebook") || source.includes("instagram") || source.includes("meta")) {
    return "Meta Ads" as const;
  }
  if (source.includes("referral") || source.includes("indicacao") || source.includes("recomend")) {
    return "Recomendação" as const;
  }
  if (!source || source.includes("organic") || source.includes("direct")) return "Orgânico" as const;
  return "Não identificado" as const;
}
