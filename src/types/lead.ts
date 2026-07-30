export const LEAD_STATUSES = [
  "pending",
  "attended",
  "qualified",
  "disqualified",
  "closed",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export type LeadSource = {
  type: "rd" | "csv" | "manual" | "meta";
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
  enteredAt: string;
  status: LeadStatus;
  notes: string;
  updatedAt: string;
  source?: LeadSource;
  companyGroupId?: string;
  duplicateStatus?: "potential" | "confirmed";
  additionalData?: Record<string, string>;
  history?: LeadHistoryEvent[];
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
