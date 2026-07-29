import { describe, expect, it } from "vitest";
import { utils, write } from "xlsx";
import {
  parsePmeWorkbook,
  PME_SPREADSHEET_ACCEPT,
  pmeSpreadsheetExtension,
} from "@/lib/pme-workbook";

const rows = [
  ["Empresa", "Telefone", "Responsável", "Site", "Status"],
  ["Empresa Exemplo", "(11) 99999-9999", "Maria", "https://empresa.example", "Contato realizado"],
];

function workbookBuffer(bookType: "ods" | "xls" | "xlsx") {
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.aoa_to_sheet(rows), "Clientes");
  return write(workbook, { bookType, type: "array" }) as ArrayBuffer;
}

describe("importador PME", () => {
  it.each([
    ["base.csv", "csv"],
    ["base.XLS", "xls"],
    ["base.xlsx", "xlsx"],
    ["base.ods", "ods"],
    ["base.pdf", null],
  ])("identifica a extensão de %s", (fileName, extension) => {
    expect(pmeSpreadsheetExtension(fileName)).toBe(extension);
  });

  it("expõe todos os formatos no seletor de arquivos", () => {
    expect(PME_SPREADSHEET_ACCEPT).toContain(".csv");
    expect(PME_SPREADSHEET_ACCEPT).toContain(".xls");
    expect(PME_SPREADSHEET_ACCEPT).toContain(".xlsx");
    expect(PME_SPREADSHEET_ACCEPT).toContain(".ods");
  });

  it("lê CSV separado por ponto e vírgula como uma única aba", async () => {
    const csv = [
      "Empresa;Telefone;Responsável;Site;Status",
      "Empresa CSV;(11) 98888-7777;João;https://csv.example;Qualificado",
    ].join("\r\n");
    const preview = await parsePmeWorkbook(new TextEncoder().encode(csv).buffer, "clientes.csv");

    expect(preview.sourceSheets).toEqual(["Dados importados"]);
    expect(preview.ignoredRows).toBe(0);
    expect(preview.records).toHaveLength(1);
    expect(preview.records[0]).toMatchObject({
      companyName: "Empresa CSV",
      contactName: "João",
      phone: "(11) 98888-7777",
      sourceRow: 2,
      sourceSheet: "Dados importados",
      website: "https://csv.example",
    });
  });

  it.each(["xls", "xlsx", "ods"] as const)("lê o formato %s preservando a aba", async (format) => {
    const preview = await parsePmeWorkbook(workbookBuffer(format), `clientes.${format}`);

    expect(preview.sourceSheets).toEqual(["Clientes"]);
    expect(preview.records).toHaveLength(1);
    expect(preview.records[0]).toMatchObject({
      companyName: "Empresa Exemplo",
      contactName: "Maria",
      phone: "(11) 99999-9999",
      sourceRow: 2,
      sourceSheet: "Clientes",
      website: "https://empresa.example",
    });
  });

  it("preserva linhas preenchidas de CSV mesmo sem cabeçalho reconhecido", async () => {
    const csv = "Empresa sem cabeçalho;(11) 97777-6666";
    const preview = await parsePmeWorkbook(new TextEncoder().encode(csv).buffer, "sem-cabecalho.csv");

    expect(preview.records).toHaveLength(1);
    expect(preview.records[0].companyName).toBe("Empresa sem cabeçalho");
    expect(preview.records[0].sourceRow).toBe(1);
  });
});
