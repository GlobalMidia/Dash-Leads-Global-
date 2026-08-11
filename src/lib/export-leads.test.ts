import { describe, expect, it } from "vitest";
import { DEMO_LEADS } from "@/lib/demo-data";
import { leadsToCsv } from "@/lib/export-leads";

describe("leads CSV export", () => {
  it("exports the supplied filtered leads with company and notes", () => {
    const csv = leadsToCsv([DEMO_LEADS[0]]);

    expect(csv).toContain('"Empresa"');
    expect(csv).toContain('"Projeto/Unidade"');
    expect(csv).toContain('"Não identificado"');
    expect(csv).toContain('"Norte Engenharia"');
    expect(csv).toContain('"Solicitou uma proposta para duas unidades."');
    expect(csv).not.toContain("Ricardo Almeida");
  });

  it("escapes quotes and line breaks", () => {
    const csv = leadsToCsv([
      {
        ...DEMO_LEADS[0],
        notes: 'Retornar com "proposta"\nna sexta.',
      },
    ]);

    expect(csv).toContain('"Retornar com ""proposta"" na sexta."');
  });

  it("neutralizes spreadsheet formulas in exported text", () => {
    const csv = leadsToCsv([
      {
        ...DEMO_LEADS[0],
        name: "=HYPERLINK(\"https://example.com\")",
        phone: "+5511999999999",
      },
    ]);

    expect(csv).toContain(
      `"'=HYPERLINK(""https://example.com"")"`,
    );
    expect(csv).toContain(`"'+5511999999999"`);
  });
});
