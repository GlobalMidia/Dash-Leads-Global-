export const LEAD_STATUSES = [
  "pending",
  "attended",
  "qualified",
  "disqualified",
  "closed",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type LeadTemperature = "cold" | "warm" | "hot";

export const LEAD_PROJECT_UNITS = [
  "global",
  "pme",
  "other",
  "unidentified",
] as const;

export type LeadProjectUnit = (typeof LEAD_PROJECT_UNITS)[number];

export type LeadSource = {
  type: "rd" | "csv" | "manual" | "meta" | "site";
  label: string;
  fileName?: string;
  importedAt?: string;
  importedBy?: string;
};

export type LeadHistoryEvent = {
  id: string;
  title: string;
  description: string;
  actor: string;
  actorEmail?: string;
  occurredAt: string;
};

export type Lead = {
  id: string;
  rdUuid: string | null;
  name: string;
  company: string;
  companyProfileUrl?: string;
  email: string;
  phone: string;
  origin: string;
  projectUnit: LeadProjectUnit;
  enteredAt: string;
  status: LeadStatus;
  temperature?: LeadTemperature;
  notes: string;
  updatedAt: string;
  source?: LeadSource;
  companyGroupId?: string;
  duplicateStatus?: "potential" | "confirmed";
  additionalData?: Record<string, string>;
  history?: LeadHistoryEvent[];
};

export const PROJECT_UNIT_LABELS: Record<LeadProjectUnit, string> = {
  global: "Global",
  pme: "PME",
  other: "Outras campanhas",
  unidentified: "Não identificado",
};

export const STATUS_LABELS: Record<LeadStatus, string> = {
  pending: "Pendente",
  attended: "Atendido",
  qualified: "Qualificado",
  disqualified: "Desqualificado",
  closed: "Fechado",
};

export const STATUS_COLORS: Record<LeadStatus, string> = {
  pending: "#7c879e",
  attended: "#2f7df4",
  qualified: "#0fae9b",
  disqualified: "#e95e6b",
  closed: "#7257d8",
};
