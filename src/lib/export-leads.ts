import { PROJECT_UNIT_LABELS, STATUS_LABELS, type Lead } from "@/types/lead";

function escapeCsv(value: string | number) {
  const normalized = String(value).replace(/\r?\n/g, " ").trim();
  const safeValue = /^[=+\-@\t\r]/.test(normalized)
    ? `'${normalized}`
    : normalized;
  return `"${safeValue.replace(/"/g, '""')}"`;
}

export function leadsToCsv(leads: Lead[]) {
  const headers = [
    "Nome",
    "Empresa",
    "E-mail",
    "Telefone",
    "Origem",
    "Projeto/Unidade",
    "Data de entrada",
    "Qualificação",
    "Observações",
  ];

  const rows = leads.map((lead) => [
    lead.name,
    lead.company,
    lead.email,
    lead.phone,
    lead.origin,
    PROJECT_UNIT_LABELS[lead.projectUnit],
    new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(lead.enteredAt)),
    STATUS_LABELS[lead.status],
    lead.notes,
  ]);

  return `\uFEFFsep=;\r\n${[headers, ...rows]
    .map((row) => row.map(escapeCsv).join(";"))
    .join("\r\n")}`;
}
