import type { Lead, LeadStatus } from "@/types/lead";

export type CsvImportRecord = {
  rowNumber: number;
  name: string;
  company: string;
  email: string;
  phone: string;
  origin: string;
  enteredAt: string;
  status: LeadStatus;
  notes: string;
  additionalData: Record<string, string>;
  match:
    | {
        kind: "company";
        label: string;
        matchedLeadId?: string;
        sourceFile?: string;
      }
    | {
        kind: "contact";
        label: string;
        matchedLeadId: string;
        sourceFile?: string;
      }
    | null;
};

export type CsvImportResult = {
  headers: string[];
  records: CsvImportRecord[];
  ignoredRows: number;
  mappedFields: string[];
};

const FIELD_ALIASES = {
  name: ["nome", "nome do lead", "lead", "contato", "nome contato"],
  company: ["empresa", "nome da empresa", "companhia", "organizacao", "organização"],
  email: ["email", "e-mail", "e mail", "email do contato"],
  phone: ["telefone", "celular", "whatsapp", "fone", "numero", "número"],
  origin: ["origem", "fonte", "source", "canal"],
  enteredAt: ["data", "data de entrada", "entrada", "created at", "data criacao"],
  status: ["status", "qualificacao", "qualificação", "etapa"],
  notes: ["observacoes", "observações", "anotacoes", "anotações", "notas"],
} as const;

type CanonicalField = keyof typeof FIELD_ALIASES;

export const SAMPLE_CSV = `Nome do lead;Empresa;E-mail;Telefone;Origem;Data de entrada;Qualificação;Observações;Campanha;Cidade
Beatriz Ramos;Norte Engenharia;beatriz@norteengenharia.com.br;(11) 99045-1320;Recomendação;23/07/2026;Pendente;Indicada pelo cliente atual;Indicações julho;São Paulo
João Ribeiro;Órbita Sistemas;joao@orbitistemas.com.br;(11) 98711-4062;Google Ads;22/07/2026;Qualificado;Pediu apresentação;Pesquisa institucional;Campinas
Mariana Souza;Norte Engenharia;mariana.souza@exemplo.com;(11) 98841-2037;Google Ads;21/07/2026;Atendido;Novo formulário da campanha;Pesquisa marca;São Paulo
Carla Nogueira;Nogueira Varejo;carla@nogueiravarejo.com.br;(21) 99210-7788;Meta Ads;20/07/2026;Pendente;;Remarketing;Rio de Janeiro`;

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeCompany(value: string) {
  return normalizeText(value);
}

function normalizeEmail(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
}

function parseCsvRows(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"') {
      if (quoted && next === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [";", ",", "\t"];
  return candidates
    .map((delimiter) => ({
      delimiter,
      count: parseCsvRows(firstLine, delimiter)[0]?.length ?? 0,
    }))
    .sort((left, right) => right.count - left.count)[0]?.delimiter ?? ";";
}

function extractExcelSeparatorDirective(text: string) {
  const directive = text.match(/^sep=(.)[ \t]*(?:\r?\n|$)/i);
  if (!directive) return { content: text, delimiter: null };

  return {
    content: text.slice(directive[0].length),
    delimiter: directive[1],
  };
}

function fieldForHeader(header: string): CanonicalField | null {
  const normalized = normalizeText(header);
  return (
    (Object.entries(FIELD_ALIASES).find(([, aliases]) =>
      aliases.some((alias) => normalizeText(alias) === normalized),
    )?.[0] as CanonicalField | undefined) ?? null
  );
}

function parseDate(value: string) {
  if (!value) return new Date().toISOString();
  const brazilian = value.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*|\s+)?(?:(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (brazilian) {
    const [, day, month, year, hour = "12", minute = "00", second = "00"] =
      brazilian;
    return new Date(
      `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}:${second}`,
    ).toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function parseStatus(value: string): LeadStatus {
  const normalized = normalizeText(value);
  if (normalized.includes("desqualificado")) return "disqualified";
  if (normalized.includes("qualificado")) return "qualified";
  if (normalized.includes("fechado")) return "closed";
  if (normalized.includes("atendido")) return "attended";
  return "pending";
}

function findMatch(
  candidate: Pick<CsvImportRecord, "company" | "email" | "phone">,
  leads: Lead[],
): CsvImportRecord["match"] {
  const email = normalizeEmail(candidate.email);
  const phone = normalizePhone(candidate.phone);
  const contactMatch = leads.find(
    (lead) =>
      (email && normalizeEmail(lead.email) === email) ||
      (phone && normalizePhone(lead.phone) === phone),
  );

  if (contactMatch) {
    return {
      kind: "contact",
      label:
        email && normalizeEmail(contactMatch.email) === email
          ? `E-mail já aparece em ${contactMatch.name}`
          : `Telefone já aparece em ${contactMatch.name}`,
      matchedLeadId: contactMatch.id,
      sourceFile: contactMatch.source?.fileName,
    };
  }

  const company = normalizeCompany(candidate.company);
  const companyMatch = leads.find(
    (lead) => company && normalizeCompany(lead.company) === company,
  );
  if (!companyMatch) return null;

  return {
    kind: "company",
    label: `Mesma empresa de ${companyMatch.name}`,
    matchedLeadId: companyMatch.id,
    sourceFile: companyMatch.source?.fileName,
  };
}

export function parseLeadCsv(text: string, existingLeads: Lead[]): CsvImportResult {
  const cleanText = text.replace(/^\uFEFF/, "");
  const { content, delimiter } = extractExcelSeparatorDirective(cleanText);
  const rows = parseCsvRows(content, delimiter ?? detectDelimiter(content));
  const headers = rows[0] ?? [];
  const mappings = headers.map(fieldForHeader);
  const mappedFields = [...new Set(mappings.filter(Boolean))] as CanonicalField[];
  let ignoredRows = 0;
  const records: CsvImportRecord[] = [];

  for (const [rowIndex, values] of rows.slice(1).entries()) {
    const canonical: Partial<Record<CanonicalField, string>> = {};
    const additionalData: Record<string, string> = {};

    headers.forEach((header, columnIndex) => {
      const value = values[columnIndex]?.trim() ?? "";
      const field = mappings[columnIndex];
      if (field) canonical[field] = value;
      else if (header && value) additionalData[header] = value;
    });

    const essentialValues = [
      canonical.name,
      canonical.company,
      canonical.email,
      canonical.phone,
    ];
    if (!essentialValues.some(Boolean)) {
      ignoredRows += 1;
      continue;
    }

    const candidate: CsvImportRecord = {
      rowNumber: rowIndex + 2,
      name: canonical.name || "Contato não informado",
      company: canonical.company || "Empresa não informada",
      email: canonical.email || "",
      phone: canonical.phone || "",
      origin: canonical.origin || "Orgânico",
      enteredAt: parseDate(canonical.enteredAt || ""),
      status: parseStatus(canonical.status || ""),
      notes: canonical.notes || "",
      additionalData,
      match: null,
    };
    candidate.match = findMatch(candidate, [...existingLeads, ...records.map((record) => ({
      id: `csv-row-${record.rowNumber}`,
      rdUuid: null,
      name: record.name,
      company: record.company,
      email: record.email,
      phone: record.phone,
      origin: record.origin,
      enteredAt: record.enteredAt,
      status: record.status,
      notes: record.notes,
      updatedAt: record.enteredAt,
    }))]);
    records.push(candidate);
  }

  return {
    headers,
    records,
    ignoredRows,
    mappedFields: mappedFields.map((field) => field),
  };
}
