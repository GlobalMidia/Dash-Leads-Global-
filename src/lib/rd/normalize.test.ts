import { describe, expect, it } from "vitest";
import { normalizeRdContact } from "@/lib/rd/normalize";

describe("RD contact normalization", () => {
  it("keeps contact phone and professional links from the detail payload", () => {
    const lead = normalizeRdContact({
      uuid: "rd-1",
      name: "Empresa Teste",
      email: "contato@empresa.com",
      mobile_phone: "+5511999999999",
      website: "https://empresa.com",
      linkedin: "https://linkedin.com/company/empresa",
      person: { name: "Ana Souza", email: "ana@empresa.com" },
      created_at: "2026-07-28T10:00:00Z",
    });

    expect(lead).toMatchObject({
      name: "Empresa Teste",
      phone: "+5511999999999",
      additionalData: {
        rdWebsite: "https://empresa.com",
        rdLinkedin: "https://linkedin.com/company/empresa",
        rdContactName: "Ana Souza",
        rdContactEmail: "ana@empresa.com",
      },
    });
  });

  it("marks an invalid RD email for the lead details popup", () => {
    const lead = normalizeRdContact({
      uuid: "rd-2",
      name: "Empresa Inativa",
      email: "contato@empresa.com",
      email_status: "bounced",
      created_at: "2026-07-28T10:00:00Z",
    });

    expect(lead?.additionalData?.rdEmailWarning).toBe("bounced");
  });
});
