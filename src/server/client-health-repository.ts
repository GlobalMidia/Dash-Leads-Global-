import "server-only";

import { getSql } from "@/server/db";
import { isLiveMode } from "@/server/lead-repository";
import type { AccountHealth, ClientAccount } from "@/types/client-health";

type Row = Record<string, unknown>;

function mapAccount(row: Row): ClientAccount {
  return {
    id: String(row.id),
    name: String(row.name),
    profileUrl: String(row.profile_url ?? ""),
    healthStatus: String(row.health_status) as AccountHealth,
    active: Boolean(row.active),
    nucleus: String(row.nucleus ?? ""),
    accountHead: String(row.account_head ?? ""),
    direction: String(row.direction ?? ""),
    lastReviewAt: row.last_review_at ? new Date(String(row.last_review_at)).toISOString() : null,
    openPendencies: Number(row.open_pendencies ?? 0),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

const accountSelect = `
  SELECT
    a.*,
    COALESCE((
      SELECT count(*)
      FROM client_pendencies p
      WHERE p.client_account_id = a.id AND p.completed_at IS NULL
    ), 0) AS open_pendencies
  FROM client_accounts a
`;

export async function listClientAccounts(): Promise<ClientAccount[]> {
  if (!isLiveMode()) return [];
  const rows = (await getSql().query(
    `${accountSelect} WHERE a.active = true ORDER BY
      CASE a.health_status WHEN 'red' THEN 0 WHEN 'yellow' THEN 1 WHEN 'unassessed' THEN 2 ELSE 3 END,
      a.updated_at DESC`,
  )) as Row[];
  return rows.map(mapAccount);
}

export async function createClientAccount(
  input: Pick<ClientAccount, "name" | "profileUrl" | "nucleus" | "accountHead" | "direction">,
  actorId?: string,
) {
  if (!isLiveMode()) throw new Error("Configure o banco antes de cadastrar uma conta.");
  const rows = (await getSql()`
    INSERT INTO client_accounts (name, profile_url, nucleus, account_head, direction, created_by)
    VALUES (${input.name}, ${input.profileUrl}, ${input.nucleus}, ${input.accountHead}, ${input.direction}, ${actorId ?? null}::uuid)
    RETURNING *
  `) as Row[];
  return mapAccount({ ...rows[0], open_pendencies: 0 });
}
