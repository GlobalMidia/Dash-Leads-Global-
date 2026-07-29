import type { PmeImportRecord } from "@/types/pme";

type SheetRows = Array<Array<string>>;
type SpreadsheetExtension = "csv" | "ods" | "xls" | "xlsx";
const MAX_IMPORT_COLUMNS = 200;

export type PmeWorkbookPreview = {
  records: PmeImportRecord[];
  ignoredRows: number;
  sourceSheets: string[];
};

export const PME_SPREADSHEET_ACCEPT = [
  ".csv",
  ".ods",
  ".xls",
  ".xlsx",
  "application/vnd.ms-excel",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
].join(",");

const SUPPORTED_EXTENSIONS = new Set<SpreadsheetExtension>(["csv", "ods", "xls", "xlsx"]);

export function pmeSpreadsheetExtension(fileName: string): SpreadsheetExtension | null {
  const extension = fileName.split(".").pop()?.toLocaleLowerCase("pt-BR") ?? "";
  return SUPPORTED_EXTENSIONS.has(extension as SpreadsheetExtension)
    ? extension as SpreadsheetExtension
    : null;
}

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function text(value: unknown) {
  const result = String(value ?? "").replace(/\s+/g, " ").trim();
  return result === "-" ? "" : result;
}

async function workbookSheets(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<Array<{ name: string; rows: SheetRows }>> {
  const extension = pmeSpreadsheetExtension(fileName);
  if (!extension) {
    throw new Error("Formato não suportado. Use CSV, XLS, XLSX ou ODS.");
  }

  const { read, utils } = await import("xlsx");
  let input: ArrayBuffer | string = buffer;
  let inputType: "array" | "string" = "array";
  if (extension === "csv") {
    const utf8 = new TextDecoder("utf-8").decode(buffer);
    input = utf8.includes("\uFFFD")
      ? new TextDecoder("windows-1252").decode(buffer)
      : utf8;
    inputType = "string";
  }
  const workbook = read(input, {
    cellDates: false,
    cellFormula: true,
    cellNF: false,
    cellStyles: false,
    type: inputType,
  });

  return workbook.SheetNames.flatMap((originalName, sheetIndex) => {
    const worksheet = workbook.Sheets[originalName];
    if (!worksheet) return [];

    const populatedCells = Object.entries(worksheet)
      .filter(([reference, cell]) => {
        if (reference.startsWith("!") || !cell || typeof cell !== "object") return false;
        const value = "v" in cell ? cell.v : undefined;
        const formula = "f" in cell ? cell.f : undefined;
        return Boolean(formula) || (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value.trim().length > 0)
        );
      });
    if (!populatedCells.length) return [];

    const populatedRange = populatedCells.reduce((range, [reference]) => {
      const cell = utils.decode_cell(reference);
      return {
        s: range.s,
        e: {
          r: Math.max(range.e.r, cell.r),
          c: Math.max(range.e.c, Math.min(cell.c, MAX_IMPORT_COLUMNS - 1)),
        },
      };
    }, {
      s: { r: 0, c: 0 },
      e: { r: 0, c: 0 },
    });
    const rawRows = utils.sheet_to_json<Array<unknown>>(worksheet, {
      blankrows: true,
      dateNF: "yyyy-mm-dd",
      defval: "",
      header: 1,
      range: populatedRange,
      raw: false,
    });
    const rows = rawRows.map((row) => {
      const values = row.map(text);
      let lastContentIndex = values.length - 1;
      while (lastContentIndex >= 0 && !values[lastContentIndex]) lastContentIndex -= 1;
      return values.slice(0, lastContentIndex + 1);
    });

    return [{
      name: extension === "csv"
        ? "Dados importados"
        : originalName || `Aba ${sheetIndex + 1}`,
      rows,
    }];
  });
}

function headerIndex(headers: string[], ...terms: string[]) {
  const normalizedHeaders = headers.map(normalized);
  for (const term of terms) {
    const index = normalizedHeaders.findIndex((header) => header === term || header.includes(term));
    if (index >= 0) return index;
  }
  return -1;
}

function hasCompanyHeader(row: string[]) {
  const knownHeaders = new Set([
    "empresa",
    "empresa cliente",
    "empresas",
    "nome da empresa",
    "razao social",
  ]);
  return row.some((value) => knownHeaders.has(normalized(value)));
}

function valueAt(row: string[], index: number) {
  return index >= 0 ? text(row[index]) : "";
}

function dateValue(value: string) {
  const raw = text(value);
  if (!raw) return null;
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (dmy) {
    const year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
    const date = new Date(Date.UTC(year, Number(dmy[2]) - 1, Number(dmy[1])));
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 25_000 && numeric < 70_000) {
    return new Date(Date.UTC(1899, 11, 30 + numeric)).toISOString().slice(0, 10);
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function moneyValue(value: string) {
  const raw = text(value).replace(/[^\d,.-]/g, "");
  if (!raw) return null;
  const standardized = raw.includes(",") && raw.includes(".")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(",", ".");
  const numeric = Number(standardized);
  return Number.isFinite(numeric) ? numeric : null;
}

function sourceData(headers: string[], row: string[]) {
  const data: Record<string, string> = {};
  // Algumas abas têm milhares de células apenas com formatação. Os dados reais
  // ficam nas primeiras colunas; limitar a leitura evita que o layout vazio
  // seja interpretado como conteúdo da importação.
  const columnLimit = Math.min(Math.max(headers.length, row.length), 200);
  for (let index = 0; index < columnLimit && Object.keys(data).length < 40; index += 1) {
    const value = text(row[index]);
    if (value) data[text(headers[index]) || `Coluna ${index + 1}`] = value;
  }
  return data;
}

function categoryForSheet(sheetName: string) {
  const name = normalized(sheetName);
  if (name.includes("indicacao")) return "Indicação";
  if (name.includes("nao localizado")) return "Não localizado";
  return "PME";
}

function parseSheet(name: string, rows: SheetRows) {
  const sheetWithoutHeaders = normalized(name) === "planilha2";
  const headerRow = sheetWithoutHeaders
    ? -1
    : rows.findIndex(hasCompanyHeader);
  const hasRecognizedHeader = headerRow >= 0;
  const headers = sheetWithoutHeaders
    ? ["empresa", "telefone", "responsavel"]
    : hasRecognizedHeader
      ? rows[headerRow] ?? []
      : [];
  const start = sheetWithoutHeaders || !hasRecognizedHeader ? 0 : headerRow + 1;
  const companyIndex = headerIndex(headers, "empresa", "empresas");
  const phoneIndex = headerIndex(headers, "telefone", "contato");
  const contactIndex = headerIndex(headers, "responsavel", "nome");
  const websiteIndex = headerIndex(headers, "site", "website");
  const valueIndex = headerIndex(headers, "valor", "financeiro");
  const contactDateIndex = headerIndex(headers, "data do contato realizado", "data de contato", "data de ligacao", "ligar nesta data");
  const recordedIndex = headerIndex(headers, "data da gravacao", "data de gravacao", "quando gravou");
  const displayedIndex = headerIndex(headers, "data de exibicao");
  const noteIndexes = headers
    .map((header, index) => ({ header: normalized(header), index }))
    .filter(({ header }) => /feedback|observacao|aceite|indicado por/.test(header));
  const statusIndexes = headers
    .map((header, index) => ({ header: normalized(header), index }))
    .filter(({ header }) => /adquiriu|pos gravacao|pos exibicao|fraudulento|status/.test(header));

  return rows.slice(start).flatMap((row, offset) => {
    const hasContent = row.some((value) => Boolean(text(value)));
    if (!hasContent) return [];
    const sourceRow = offset + start + 1;
    const contactName = valueAt(row, contactIndex);
    const phone = valueAt(row, phoneIndex);
    const sourceCompany = valueAt(row, companyIndex >= 0 ? companyIndex : 0);
    // Nenhuma linha preenchida é descartada: quando a origem não trouxe a
    // empresa, mantemos o registro com uma identificação clara para revisão.
    const companyName = sourceCompany || (contactName
      ? `Empresa não informada — ${contactName}`
      : phone
        ? `Empresa não informada — ${phone}`
        : `Empresa não informada — ${name}, linha ${sourceRow}`);
    const notes = noteIndexes
      .map(({ header, index }) => {
        const value = valueAt(row, index);
        return value ? `${header}: ${value}` : "";
      })
      .filter(Boolean)
      .join(" · ");
    const historicStatus = statusIndexes
      .map(({ header, index }) => {
        const value = valueAt(row, index);
        return value ? `${header}: ${value}` : "";
      })
      .filter(Boolean)
      .join(" · ");
    return [{
      sourceSheet: name,
      sourceRow,
      category: categoryForSheet(name),
      companyName,
      contactName,
      phone,
      website: valueAt(row, websiteIndex),
      historicStatus,
      historicValue: moneyValue(valueAt(row, valueIndex)),
      recordedAt: dateValue(valueAt(row, recordedIndex)),
      contactAt: dateValue(valueAt(row, contactDateIndex)),
      displayedAt: dateValue(valueAt(row, displayedIndex)),
      notes: notes.slice(0, 2000),
      sourceData: sourceData(headers, row),
    } satisfies PmeImportRecord];
  });
}

export async function parsePmeWorkbook(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<PmeWorkbookPreview> {
  const sheets = await workbookSheets(buffer, fileName);
  if (!sheets.length) {
    throw new Error("O arquivo não possui nenhuma linha preenchida.");
  }
  const records = sheets.flatMap(({ name, rows }) => parseSheet(name, rows));
  return {
    records,
    ignoredRows: 0,
    sourceSheets: sheets.map((sheet) => sheet.name),
  };
}
