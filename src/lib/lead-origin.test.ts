import { describe, expect, it } from "vitest";
import { normalizeLeadOrigin } from "@/lib/lead-origin";

describe("lead origin normalization", () => {
  it.each([
    ["Google / CPC", "Google Ads"],
    ["AdWords", "Google Ads"],
    ["Instagram Ads", "Meta Ads"],
    ["Facebook", "Meta Ads"],
    ["Indicação de cliente", "Recomendação"],
    ["Referral", "Recomendação"],
    ["Busca orgânica", "Orgânico"],
    ["Landing Page", "Orgânico"],
    ["", "Orgânico"],
  ])("maps %s to %s", (input, expected) => {
    expect(normalizeLeadOrigin(input)).toBe(expected);
  });
});
