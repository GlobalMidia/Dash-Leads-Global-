import { describe, expect, it } from "vitest";
import {
  inferProjectUnit,
  inferSiteLeadOrigin,
  scoreSiteJourney,
} from "@/lib/site-journey";

describe("site journey", () => {
  it("classifies a submitted and WhatsApp-engaged lead as hot", () => {
    const result = scoreSiteJourney([
      { name: "page_view", sessionId: "one" },
      { name: "engagement_60", sessionId: "one" },
      { name: "form_submit", sessionId: "one" },
      { name: "whatsapp_click", sessionId: "one" },
    ]);

    expect(result.temperature).toBe("hot");
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.reasons).toContain("avançou para o WhatsApp");
  });

  it("counts repeated visits without multiplying identical event scores", () => {
    const result = scoreSiteJourney([
      { name: "page_view", sessionId: "one" },
      { name: "page_view", sessionId: "two" },
      { name: "page_view", sessionId: "two" },
    ]);

    expect(result.sessions).toBe(2);
    expect(result.score).toBe(6);
  });

  it("recognizes paid traffic identifiers and project units", () => {
    expect(inferSiteLeadOrigin({ gclid: "abc" })).toBe("Google Ads");
    expect(inferSiteLeadOrigin({ source: "instagram", fbclid: "xyz" })).toBe("Meta Ads");
    expect(inferProjectUnit("www.globalmidia.digital", "/contato")).toBe("global");
    expect(inferProjectUnit("programamundoempresarial.com.br", "/pme")).toBe("pme");
  });
});
