import { STATUS_LABELS, type Lead } from "@/types/lead";

function escapeCsv(value: string | number) {
  const normalized = String(value).replace(/\r?\n/g, " ").trim();
  return `"${normalized.replace(/"/g, '""')}"`;
}

export function leadsToCsv(leads: Lead[]) {
  const headers = [
    "Nome",
    "Empresa",
    "E-mail",
    "Telefone",
    "Origem",
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
