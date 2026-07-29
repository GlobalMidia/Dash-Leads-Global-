import type { ClientAccountAuditChange } from "@/types/client-health";

type Snapshot = Record<string, unknown> | null;

const trackedFields = [
  { field: "name", label: "Nome da conta", empty: "Não informado" },
  { field: "nucleus", label: "Núcleo", empty: "Não definido" },
  { field: "account_head", label: "Head responsável", empty: "Não informado" },
  { field: "direction", label: "Direção", empty: "Não informada" },
  { field: "active", label: "Situação da conta", empty: "Não informada" },
] as const;

function displayValue(field: string, value: unknown, empty: string) {
  if (field === "active") return value === true ? "Ativa" : value === false ? "Encerrada" : empty;
  const text = String(value ?? "").trim();
  return text || empty;
}

export function getClientAccountAuditChanges(
  before: Snapshot,
  after: Snapshot,
): ClientAccountAuditChange[] {
  if (!before || !after) return [];
  return trackedFields.flatMap(({ field, label, empty }) => {
    const beforeValue = displayValue(field, before[field], empty);
    const afterValue = displayValue(field, after[field], empty);
    return beforeValue === afterValue
      ? []
      : [{ field, label, before: beforeValue, after: afterValue }];
  });
}

export function clientAccountAuditTitle(action: string) {
  if (action === "client_account.created") return "Conta cadastrada";
  if (action === "client_account.ended") return "Conta encerrada";
  if (action === "client_account.reactivated") return "Conta reativada";
  if (action === "client_account.information_updated") return "Informações atualizadas";
  return "Alteração na conta";
}
