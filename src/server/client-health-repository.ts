import "server-only";

import { getSql } from "@/server/db";
import { isLiveMode } from "@/server/lead-repository";
import type {
  AccountHealth,
  ClientAccount,
  ClientAccountDetails,
  ClientHealthReview,
  ClientPendency,
  ClientSatisfaction,
  DeliveryStatus,
} from "@/types/client-health";

type Row = Record<string, unknown>;

function mapAccount(row: Row): ClientAccount {
  return {
    id: String(row.id),
    name: String(row.name),
    cnpj: String(row.cnpj ?? ""),
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

function mapReview(row: Row): ClientHealthReview {
  return {
    id: String(row.id),
    clientAccountId: String(row.client_account_id),
    reviewWeek: new Date(String(row.review_week)).toISOString(),
    healthStatus: String(row.health_status) as ClientHealthReview["healthStatus"],
    satisfaction: String(row.satisfaction) as ClientSatisfaction,
    deliveryStatus: String(row.delivery_status) as DeliveryStatus,
    notes: String(row.notes ?? ""),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function mapPendency(row: Row): ClientPendency {
  return {
    id: String(row.id),
    clientAccountId: String(row.client_account_id),
    title: String(row.title),
    reviewWeek: new Date(String(row.review_week)).toISOString(),
    completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
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
  input: Pick<ClientAccount, "name" | "cnpj" | "profileUrl" | "nucleus" | "accountHead" | "direction">,
  actorId?: string,
) {
  if (!isLiveMode()) throw new Error("Configure o banco antes de cadastrar uma conta.");
  const rows = (await getSql()`
    INSERT INTO client_accounts (name, cnpj, profile_url, nucleus, account_head, direction, created_by)
    VALUES (${input.name}, ${input.cnpj}, ${input.profileUrl}, ${input.nucleus}, ${input.accountHead}, ${input.direction}, ${actorId ?? null}::uuid)
    RETURNING *
  `) as Row[];
  return mapAccount({ ...rows[0], open_pendencies: 0 });
}

export async function getClientAccountDetails(accountId: string): Promise<ClientAccountDetails | null> {
  if (!isLiveMode()) return null;
  const sql = getSql();
  const [accounts, reviews, pendencies] = await Promise.all([
    sql.query(`${accountSelect} WHERE a.id = $1 LIMIT 1`, [accountId]) as Promise<Row[]>,
    sql.query(
      "SELECT * FROM client_health_reviews WHERE client_account_id = $1 ORDER BY review_week DESC, updated_at DESC LIMIT 52",
      [accountId],
    ) as Promise<Row[]>,
    sql.query(
      "SELECT * FROM client_pendencies WHERE client_account_id = $1 ORDER BY completed_at NULLS FIRST, review_week DESC, created_at DESC LIMIT 200",
      [accountId],
    ) as Promise<Row[]>,
  ]);
  const account = accounts[0];
  return account ? { ...mapAccount(account), reviews: reviews.map(mapReview), pendencies: pendencies.map(mapPendency) } : null;
}

export async function saveClientHealthReview(input: {
  accountId: string;
  healthStatus: Exclude<AccountHealth, "unassessed">;
  satisfaction: ClientSatisfaction;
  deliveryStatus: DeliveryStatus;
  notes: string;
  reviewWeek: string;
  actorId?: string;
}) {
  if (!isLiveMode()) throw new Error("Configure o banco antes de registrar uma avaliação.");
  const sql = getSql();
  const rows = await sql.transaction([
    sql`
      INSERT INTO client_health_reviews (
        client_account_id, review_week, health_status, satisfaction, delivery_status, notes, created_by
      ) VALUES (
        ${input.accountId}::uuid, ${input.reviewWeek}::date, ${input.healthStatus},
        ${input.satisfaction}, ${input.deliveryStatus}, ${input.notes}, ${input.actorId ?? null}::uuid
      ) ON CONFLICT (client_account_id, review_week) DO UPDATE SET
        health_status = EXCLUDED.health_status,
        satisfaction = EXCLUDED.satisfaction,
        delivery_status = EXCLUDED.delivery_status,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING *
    `,
    sql`
      UPDATE client_accounts
      SET health_status = ${input.healthStatus}, last_review_at = NOW(), updated_at = NOW()
      WHERE id = ${input.accountId}::uuid
    `,
  ]);
  return mapReview((rows[0] as Row[])[0]);
}

export async function addClientPendency(input: { accountId: string; title: string; reviewWeek: string; actorId?: string }) {
  if (!isLiveMode()) throw new Error("Configure o banco antes de criar uma pendência.");
  const rows = (await getSql()`
    INSERT INTO client_pendencies (client_account_id, title, review_week, created_by)
    VALUES (${input.accountId}::uuid, ${input.title}, ${input.reviewWeek}::date, ${input.actorId ?? null}::uuid)
    RETURNING *
  `) as Row[];
  return mapPendency(rows[0]);
}

export async function setClientPendencyCompletion(input: { accountId: string; pendencyId: string; completed: boolean; actorId?: string }) {
  if (!isLiveMode()) throw new Error("Configure o banco antes de atualizar uma pendência.");
  const rows = (await getSql()`
    UPDATE client_pendencies
    SET completed_at = ${input.completed ? new Date().toISOString() : null}::timestamptz,
      completed_by = ${input.completed ? input.actorId ?? null : null}::uuid,
      updated_at = NOW()
    WHERE id = ${input.pendencyId}::uuid AND client_account_id = ${input.accountId}::uuid
    RETURNING *
  `) as Row[];
  return rows[0] ? mapPendency(rows[0]) : null;
}

export async function setClientAccountActive(accountId: string, active: boolean) {
  if (!isLiveMode()) throw new Error("Configure o banco antes de atualizar uma conta.");
  const rows = (await getSql()`
    UPDATE client_accounts SET active = ${active}, updated_at = NOW()
    WHERE id = ${accountId}::uuid
    RETURNING *, 0::int AS open_pendencies
  `) as Row[];
  return rows[0] ? mapAccount(rows[0]) : null;
}
