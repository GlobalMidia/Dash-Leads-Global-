export type AccountHealth = "green" | "yellow" | "red" | "unassessed";
export type ClientSatisfaction = "satisfied" | "neutral" | "dissatisfied" | "unknown";
export type DeliveryStatus = "on_track" | "attention" | "late" | "unknown";

export type ClientAccount = {
  id: string;
  name: string;
  cnpj: string;
  profileUrl: string;
  healthStatus: AccountHealth;
  active: boolean;
  nucleus: string;
  accountHead: string;
  direction: string;
  lastReviewAt: string | null;
  openPendencies: number;
  createdAt: string;
  updatedAt: string;
};

export type ClientHealthReview = {
  id: string;
  clientAccountId: string;
  reviewWeek: string;
  healthStatus: Exclude<AccountHealth, "unassessed">;
  satisfaction: ClientSatisfaction;
  deliveryStatus: DeliveryStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type ClientPendency = {
  id: string;
  clientAccountId: string;
  title: string;
  reviewWeek: string;
  completedAt: string | null;
  createdAt: string;
};

export type ClientAccountAuditChange = {
  field: string;
  label: string;
  before: string;
  after: string;
};

export type ClientAccountAuditEvent = {
  id: string;
  action: string;
  title: string;
  actor: string;
  actorEmail?: string;
  changes: ClientAccountAuditChange[];
  occurredAt: string;
};

export type ClientAccountDetails = ClientAccount & {
  reviews: ClientHealthReview[];
  pendencies: ClientPendency[];
  auditEvents: ClientAccountAuditEvent[];
};
