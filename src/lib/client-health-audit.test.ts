import { describe, expect, it } from "vitest";
import {
  clientAccountAuditTitle,
  getClientAccountAuditChanges,
} from "@/lib/client-health-audit";

describe("auditoria de saúde das contas", () => {
  it("lista apenas os campos efetivamente alterados", () => {
    expect(getClientAccountAuditChanges(
      { name: "Cliente", nucleus: "Performance", account_head: "", direction: "Executiva", active: true },
      { name: "Cliente", nucleus: "Criação", account_head: "Marina", direction: "Executiva", active: true },
    )).toEqual([
      { field: "nucleus", label: "Núcleo", before: "Performance", after: "Criação" },
      { field: "account_head", label: "Head responsável", before: "Não informado", after: "Marina" },
    ]);
  });

  it("descreve encerramento e reativação", () => {
    expect(getClientAccountAuditChanges({ active: true }, { active: false })).toEqual([
      { field: "active", label: "Situação da conta", before: "Ativa", after: "Encerrada" },
    ]);
    expect(clientAccountAuditTitle("client_account.ended")).toBe("Conta encerrada");
    expect(clientAccountAuditTitle("client_account.reactivated")).toBe("Conta reativada");
  });
});
