import { describe, expect, it } from "vitest";
import {
  formatCnpj,
  isCurrentFridayReminder,
  isWeeklyReviewPending,
  latestReviewDeadline,
  normalizeCnpj,
  reviewWeek,
} from "@/lib/client-health";

describe("regras de saúde das contas", () => {
  it("normaliza e formata CNPJ", () => {
    expect(normalizeCnpj("12.345.678/0001-90")).toBe("12345678000190");
    expect(formatCnpj("12345678000190")).toBe("12.345.678/0001-90");
  });

  it("calcula a segunda-feira da revisão sem depender de UTC", () => {
    expect(reviewWeek(new Date("2026-07-29T15:00:00Z"))).toBe("2026-07-27");
  });

  it("ativa o novo ciclo na sexta-feira às oito", () => {
    expect(latestReviewDeadline(new Date("2026-07-31T10:59:00Z"))).toEqual(new Date("2026-07-24T11:00:00Z"));
    expect(latestReviewDeadline(new Date("2026-07-31T11:00:00Z"))).toEqual(new Date("2026-07-31T11:00:00Z"));
    expect(isCurrentFridayReminder(new Date("2026-07-31T10:59:00Z"))).toBe(false);
    expect(isCurrentFridayReminder(new Date("2026-07-31T11:00:00Z"))).toBe(true);
  });

  it("mantém o aviso depois de sexta até uma revisão ser registrada", () => {
    const account = {
      createdAt: new Date(2026, 6, 1, 10).toISOString(),
      lastReviewAt: new Date(2026, 6, 13, 10).toISOString(),
    };
    expect(isWeeklyReviewPending(account, new Date("2026-07-24T12:00:00Z"))).toBe(true);
    expect(isWeeklyReviewPending(account, new Date("2026-07-27T12:00:00Z"))).toBe(true);
    expect(isWeeklyReviewPending({
      ...account,
      lastReviewAt: new Date("2026-07-27T13:00:00Z").toISOString(),
    }, new Date("2026-07-27T14:00:00Z"))).toBe(false);
  });

  it("não cobra imediatamente uma conta criada depois do último aviso", () => {
    expect(isWeeklyReviewPending({
      createdAt: new Date("2026-07-25T13:00:00Z").toISOString(),
      lastReviewAt: null,
    }, new Date("2026-07-27T13:00:00Z"))).toBe(false);
  });
});
