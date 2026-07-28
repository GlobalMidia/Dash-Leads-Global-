import { strFromU8, unzipSync } from "fflate";
import { normalizeCompany } from "@/lib/lead-normalization";
import type { PmeImportRecord } from "@/types/pme";

type SheetRows = Array<Array<string>>;

export type PmeWorkbookPreview = {
  records: PmeImportRecord[];
  ignoredRows: number;
  sourceSheets: string[];
};

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

function columnIndex(reference = "") {
  const letters = reference.match(/[A-Z]+/i)?.[0]?.toUpperCase() ?? "A";
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function sheetDocument(file: Uint8Array) {
  return new DOMParser().parseFromString(strFromU8(file), "application/xml");
}

function sharedStrings(files: Record<string, Uint8Array>) {
  const content = files["xl/sharedStrings.xml"];
  if (!content) return [];
  const document = sheetDocument(content);
  return [...document.getElementsByTagName("si")].map((item) =>
    [...item.getElementsByTagName("t")].map((node) => node.textContent ?? "").join(""),
  );
}

function worksheetRows(file: Uint8Array, shared: string[]): SheetRows {
  const document = sheetDocument(file);
  return [...document.getElementsByTagName("row")].map((row) => {
    const values: string[] = [];
    for (const cell of [...row.getElementsByTagName("c")]) {
      const index = columnIndex(cell.getAttribute("r") ?? "");
      const kind = cell.getAttribute("t");
      const valueNode = cell.getElementsByTagName("v")[0];
      const inline = [...cell.getElementsByTagName("t")]
        .map((node) => node.textContent ?? "")
        .join("");
      const raw = valueNode?.textContent ?? inline;
      values[index] = kind === "s" ? shared[Number(raw)] ?? "" : raw;
    }
    return values.map(text);
  });
}

function workbookSheets(buffer: ArrayBuffer): Array<{ name: string; rows: SheetRows }> {
  const files = unzipSync(new Uint8Array(buffer));
  const workbookFile = files["xl/workbook.xml"];
  const relationsFile = files["xl/_rels/workbook.xml.rels"];
  if (!workbookFile || !relationsFile) throw new Error("O arquivo não possui a estrutura esperada de uma planilha XLSX.");

  const workbook = sheetDocument(workbookFile);
  const relations = sheetDocument(relationsFile);
  const targets = new Map(
    [...relations.getElementsByTagName("Relationship")].map((relation) => [
      relation.getAttribute("Id") ?? "",
      relation.getAttribute("Target") ?? "",
    ]),
  );
  const shared = sharedStrings(files);

  return [...workbook.getElementsByTagName("sheet")].flatMap((sheet) => {
    const relationshipId = sheet.getAttribute("r:id") ?? sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? "";
    const target = targets.get(relationshipId);
    if (!target) return [];
    const path = `xl/${target.replace(/^\//, "").replace(/^xl\//, "")}`;
    const content = files[path];
    if (!content) return [];
    return [{ name: sheet.getAttribute("name") ?? "Aba sem nome", rows: worksheetRows(content, shared) }];
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
  return Object.fromEntries(
    headers.map((header, index) => [text(header) || `Coluna ${index + 1}`, text(row[index])])
      .filter(([, value]) => Boolean(value))
      .slice(0, 40),
  );
}

function categoryForSheet(sheetName: string) {
  const name = normalized(sheetName);
  if (name.includes("indicacao")) return "Indicação";
  if (name.includes("nao localizado")) return "Não localizado";
  return "PME";
}

function parseSheet(name: string, rows: SheetRows) {
  const firstRow = rows[0] ?? [];
  const sheetWithoutHeaders = normalized(name) === "planilha2";
  const headers = sheetWithoutHeaders ? ["empresa", "telefone", "responsavel"] : firstRow;
  const start = sheetWithoutHeaders ? 0 : 1;
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
    const companyName = valueAt(row, companyIndex >= 0 ? companyIndex : 0);
    if (!companyName || !normalizeCompany(companyName)) return [];
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
      sourceRow: offset + start + 1,
      category: categoryForSheet(name),
      companyName,
      contactName: valueAt(row, contactIndex),
      phone: valueAt(row, phoneIndex),
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

export function parsePmeWorkbook(buffer: ArrayBuffer): PmeWorkbookPreview {
  const sheets = workbookSheets(buffer);
  const records = sheets.flatMap(({ name, rows }) => parseSheet(name, rows));
  const populatedRows = sheets.reduce(
    (total, { name, rows }) => total + Math.max(rows.length - (normalized(name) === "planilha2" ? 0 : 1), 0),
    0,
  );
  return {
    records,
    ignoredRows: Math.max(populatedRows - records.length, 0),
    sourceSheets: sheets.map((sheet) => sheet.name),
  };
}
