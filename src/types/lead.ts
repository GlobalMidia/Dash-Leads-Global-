export const LEAD_STATUSES = [
  "pending",
  "attended",
  "qualified",
  "disqualified",
  "closed",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export type Lead = {
  id: string;
  rdUuid: string | null;
  name: string;
  email: string;
  phone: string;
  origin: string;
  enteredAt: string;
  status: LeadStatus;
  updatedAt: string;
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
