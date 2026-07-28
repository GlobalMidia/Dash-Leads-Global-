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

  it("keeps CRM opportunity fields and recognizes negotiation as qualified", () => {
    const lead = normalizeRdContact({
      uuid: "rd-3",
      name: "Ezatta",
      email: "comercial@ezattaequipamentos.com.br",
      cf_valor_total_da_oportunidade_no_crm: "7500.0",
      cf_etapa_do_funil_de_vendas_no_crm: "Negocia\u00e7\u00e3o",
      cf_funil_de_vendas_no_crm: "Funil de Vendas",
      cf_qualificacao_da_oportunidade_no_crm: "1",
      cf_nome_do_responsavel_pela_oportunidade_no_crm: "Agatha Silveira",
    });

    expect(lead).toMatchObject({
      status: "qualified",
      additionalData: {
        rdOpportunityValue: "7500.0",
        rdCrmSalesStage: "Negocia\u00e7\u00e3o",
        rdCrmSalesFunnel: "Funil de Vendas",
        rdCrmQualification: "1",
        rdCrmOwner: "Agatha Silveira",
      },
    });
  });

  it("reads CRM custom fields when the RD field definition is nested", () => {
    const lead = normalizeRdContact({
      uuid: "rd-4",
      name: "Empresa CRM",
      email: "contato@empresa-crm.com",
      custom_fields: [
        {
          field: { api_identifier: "cf_etapa_do_funil_de_vendas_no_crm" },
          value: "Contato Realizado",
        },
        {
          definition: { name: "Funil de vendas no CRM (ultima atualizacao)" },
          field_value: "Funil de Vendas",
        },
        {
          custom_field: { label: "Nome do responsavel pela oportunidade no CRM" },
          value: "Mabel Oliveira",
        },
      ],
    });

    expect(lead?.additionalData).toMatchObject({
      rdCrmSalesStage: "Contato Realizado",
      rdCrmSalesFunnel: "Funil de Vendas",
      rdCrmOwner: "Mabel Oliveira",
    });
  });
});
