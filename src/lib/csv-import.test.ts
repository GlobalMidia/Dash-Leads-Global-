import { describe, expect, it } from "vitest";
import { DEMO_LEADS } from "@/lib/demo-data";
import { parseLeadCsv, SAMPLE_CSV } from "@/lib/csv-import";
import { leadsToCsv } from "@/lib/export-leads";

describe("CSV lead import", () => {
  it("maps known columns and keeps additional data", () => {
    const result = parseLeadCsv(SAMPLE_CSV, DEMO_LEADS);

    expect(result.records).toHaveLength(4);
    expect(result.records[0].additionalData).toEqual({
      Campanha: "Indicações julho",
      Cidade: "São Paulo",
    });
    expect(result.records[0].match?.kind).toBe("company");
    expect(result.records[2].match?.kind).toBe("contact");
  });

  it("accepts quoted comma separated values", () => {
    const result = parseLeadCsv(
      'Nome,Empresa,E-mail\n"Ana Souza","Empresa, Sul",ana@empresa.com',
      [],
    );

    expect(result.records[0].company).toBe("Empresa, Sul");
    expect(result.records[0].email).toBe("ana@empresa.com");
  });

  it("reimports a CSV exported by the dashboard", () => {
    const sourceLeads = DEMO_LEADS.slice(0, 3);
    const result = parseLeadCsv(leadsToCsv(sourceLeads), []);

    expect(result.ignoredRows).toBe(0);
    expect(result.records).toHaveLength(sourceLeads.length);
    expect(result.records[0]).toMatchObject({
      name: sourceLeads[0].name,
      company: sourceLeads[0].company,
      email: sourceLeads[0].email,
      phone: sourceLeads[0].phone,
      origin: sourceLeads[0].origin,
      status: sourceLeads[0].status,
      notes: sourceLeads[0].notes,
    });
    expect(result.records[0].enteredAt).toBe(sourceLeads[0].enteredAt);
  });

  it("rejects rows with invalid dates instead of silently using today", () => {
    const result = parseLeadCsv(
      "Nome;E-mail;Data de entrada\nAna;ana@empresa.com;31/02/2026",
      [],
    );

    expect(result.records).toHaveLength(0);
    expect(result.invalidRows).toEqual([
      {
        rowNumber: 2,
        reason: "Data de entrada inválida: 31/02/2026",
      },
    ]);
  });
});
