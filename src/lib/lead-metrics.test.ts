import { describe, expect, it } from "vitest";
import { DEMO_LEADS } from "@/lib/demo-data";
import { filterLeads, groupByOrigin, summarizeLeads } from "@/lib/lead-metrics";

describe("lead metrics", () => {
  it("summarizes all qualification states", () => {
    const summary = summarizeLeads(DEMO_LEADS);
    expect(summary.total).toBe(16);
    expect(summary.closed).toBe(4);
    expect(summary.conversionRate).toBe(25);
  });

  it("filters by search and status", () => {
    const result = filterLeads(DEMO_LEADS, {
      query: "mariana",
      origin: "all",
      status: "qualified",
      startDate: "",
      endDate: "",
    });
    expect(result.map((lead) => lead.id)).toEqual(["demo-001"]);
  });

  it("finds a lead by company name", () => {
    const result = filterLeads(DEMO_LEADS, {
      query: "Vértice Arquitetura",
      origin: "all",
      status: "all",
      startDate: "",
      endDate: "",
    });
    expect(result.map((lead) => lead.name)).toEqual(["Camila Ferreira"]);
  });

  it("sorts origins by descending lead count", () => {
    const origins = groupByOrigin(DEMO_LEADS);
    expect(origins[0]).toEqual({ origin: "Google Ads", count: 5 });
  });
});
