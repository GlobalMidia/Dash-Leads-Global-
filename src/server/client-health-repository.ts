import "server-only";

import {
  clientAccountAuditTitle,
  getClientAccountAuditChanges,
} from "@/lib/client-health-audit";
import { getSql } from "@/server/db";
import { isLiveMode } from "@/server/lead-repository";
import type {
  AccountHealth,
  ClientAccount,
  ClientAccountAuditEvent,
  ClientAccountDetails,
  ClientHealthReview,
  ClientPendency,
  ClientSatisfaction,
  DeliveryStatus,
} from "@/types/client-health";

type Row = Record<string, unknown>;
type AuditActor = { userId?: string; email?: string; name?: string };

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

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
    closedAt: row.closed_at ? new Date(String(row.closed_at)).toISOString() : null,
    closedBy: String(row.closed_by ?? ""),
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

function mapAuditEvent(row: Row): ClientAccountAuditEvent {
  const metadata = asObject(row.metadata);
  return {
    id: String(row.id),
    action: String(row.action),
    title: clientAccountAuditTitle(String(row.action)),
    actor: String(metadata?.actorName ?? row.actor_name ?? row.actor_email ?? "Sistema"),
    actorEmail: row.actor_email ? String(row.actor_email) : undefined,
    changes: getClientAccountAuditChanges(
      asObject(row.before_data),
      asObject(row.after_data),
    ),
    occurredAt: new Date(String(row.created_at)).toISOString(),
  };
}

const accountSelect = `
  SELECT
    a.*,
    COALESCE((
      SELECT count(*)
      FROM client_pendencies p
      WHERE p.client_account_id = a.id AND p.completed_at IS NULL
    ), 0) AS open_pendencies,
    closure.created_at AS closed_at,
    COALESCE(
      closure.metadata->>'actorName',
      closure.actor_name,
      closure.actor_email,
      ''
    ) AS closed_by
  FROM client_accounts a
  LEFT JOIN LATERAL (
    SELECT log.created_at, log.metadata, log.actor_email, actor.name AS actor_name
    FROM audit_log log
    LEFT JOIN application_users actor ON actor.id = log.actor_user_id
    WHERE log.entity_type = 'client_account'
      AND log.entity_id = a.id::text
      AND log.action = 'client_account.ended'
    ORDER BY log.created_at DESC
    LIMIT 1
  ) closure ON true
`;

export type ClientAccountListStatus = "active" | "closed" | "all";

export async function listClientAccounts(status: ClientAccountListStatus = "active"): Promise<ClientAccount[]> {
  if (!isLiveMode()) return [];
  const statusFilter = status === "all"
    ? ""
    : status === "closed"
      ? "WHERE a.active = false"
      : "WHERE a.active = true";
  const rows = (await getSql().query(
    `${accountSelect} ${statusFilter} ORDER BY
      a.active DESC,
      CASE a.health_status WHEN 'red' THEN 0 WHEN 'yellow' THEN 1 WHEN 'unassessed' THEN 2 ELSE 3 END,
      a.updated_at DESC`,
  )) as Row[];
  return rows.map(mapAccount);
}

export async function createClientAccount(
  input: Pick<ClientAccount, "name" | "cnpj" | "profileUrl" | "nucleus" | "accountHead" | "direction">,
  actor: AuditActor = {},
) {
  if (!isLiveMode()) throw new Error("Configure o banco antes de cadastrar uma conta.");
  const rows = (await getSql()`
    WITH inserted AS (
      INSERT INTO client_accounts (name, cnpj, profile_url, nucleus, account_head, direction, created_by)
      VALUES (${input.name}, ${input.cnpj}, ${input.profileUrl}, ${input.nucleus}, ${input.accountHead}, ${input.direction}, ${actor.userId ?? null}::uuid)
      RETURNING *
    ),
    logged AS (
      INSERT INTO audit_log (
        actor_user_id, actor_email, action, entity_type, entity_id,
        before_data, after_data, metadata
      )
      SELECT
        ${actor.userId ?? null}::uuid,
        ${actor.email ?? null},
        'client_account.created',
        'client_account',
        inserted.id::text,
        NULL,
        to_jsonb(inserted),
        ${JSON.stringify({ actorName: actor.name ?? actor.email ?? "Sistema" })}::jsonb
      FROM inserted
    )
    SELECT *, 0::int AS open_pendencies FROM inserted
  `) as Row[];
  return mapAccount(rows[0]);
}

export async function getClientAccountDetails(accountId: string): Promise<ClientAccountDetails | null> {
  if (!isLiveMode()) return null;
  const sql = getSql();
  const [accounts, reviews, pendencies, auditEvents] = await Promise.all([
    sql.query(`${accountSelect} WHERE a.id = $1 LIMIT 1`, [accountId]) as Promise<Row[]>,
    sql.query(
      "SELECT * FROM client_health_reviews WHERE client_account_id = $1 ORDER BY review_week DESC, updated_at DESC LIMIT 52",
      [accountId],
    ) as Promise<Row[]>,
    sql.query(
      "SELECT * FROM client_pendencies WHERE client_account_id = $1 ORDER BY completed_at NULLS FIRST, review_week DESC, created_at DESC LIMIT 200",
      [accountId],
    ) as Promise<Row[]>,
    sql.query(
      `SELECT a.*, u.name AS actor_name
       FROM audit_log a
       LEFT JOIN application_users u ON u.id = a.actor_user_id
       WHERE a.entity_type = 'client_account' AND a.entity_id = $1
       ORDER BY a.created_at DESC
       LIMIT 100`,
      [accountId],
    ) as Promise<Row[]>,
  ]);
  const account = accounts[0];
  return account ? {
    ...mapAccount(account),
    reviews: reviews.map(mapReview),
    pendencies: pendencies.map(mapPendency),
    auditEvents: auditEvents.map(mapAuditEvent),
  } : null;
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

export async function setClientAccountActive(
  accountId: string,
  active: boolean,
  actor: AuditActor = {},
) {
  if (!isLiveMode()) throw new Error("Configure o banco antes de atualizar uma conta.");
  const rows = (await getSql()`
    WITH previous AS MATERIALIZED (
      SELECT *
      FROM client_accounts
      WHERE id = ${accountId}::uuid
      FOR UPDATE
    ),
    updated AS (
      UPDATE client_accounts
      SET active = ${active}, updated_at = NOW()
      WHERE id = ${accountId}::uuid
      RETURNING *
    ),
    logged AS (
      INSERT INTO audit_log (
        actor_user_id, actor_email, action, entity_type, entity_id,
        before_data, after_data, metadata
      )
      SELECT
        ${actor.userId ?? null}::uuid,
        ${actor.email ?? null},
        ${active ? "client_account.reactivated" : "client_account.ended"},
        'client_account',
        updated.id::text,
        to_jsonb(previous),
        to_jsonb(updated),
        ${JSON.stringify({ actorName: actor.name ?? actor.email ?? "Sistema" })}::jsonb
      FROM updated
      JOIN previous ON previous.id = updated.id
      WHERE previous.active IS DISTINCT FROM updated.active
    )
    SELECT
      updated.*,
      COALESCE((
        SELECT count(*)
        FROM client_pendencies p
        WHERE p.client_account_id = updated.id AND p.completed_at IS NULL
      ), 0) AS open_pendencies,
      CASE WHEN updated.active THEN NULL ELSE NOW() END AS closed_at,
      CASE WHEN updated.active THEN '' ELSE ${actor.name ?? actor.email ?? "Sistema"} END AS closed_by
    FROM updated
  `) as Row[];
  return rows[0] ? mapAccount(rows[0]) : null;
}

export async function updateClientAccountInformation(
  accountId: string,
  input: Pick<ClientAccount, "name" | "nucleus" | "accountHead" | "direction">,
  actor: AuditActor = {},
) {
  if (!isLiveMode()) throw new Error("Configure o banco antes de atualizar uma conta.");
  const rows = (await getSql()`
    WITH previous AS MATERIALIZED (
      SELECT *
      FROM client_accounts
      WHERE id = ${accountId}::uuid
      FOR UPDATE
    ),
    updated AS (
      UPDATE client_accounts
      SET name = ${input.name},
        nucleus = ${input.nucleus},
        account_head = ${input.accountHead},
        direction = ${input.direction},
        updated_at = NOW()
      WHERE id = ${accountId}::uuid
      RETURNING *
    ),
    logged AS (
      INSERT INTO audit_log (
        actor_user_id, actor_email, action, entity_type, entity_id,
        before_data, after_data, metadata
      )
      SELECT
        ${actor.userId ?? null}::uuid,
        ${actor.email ?? null},
        'client_account.information_updated',
        'client_account',
        updated.id::text,
        to_jsonb(previous),
        to_jsonb(updated),
        ${JSON.stringify({ actorName: actor.name ?? actor.email ?? "Sistema" })}::jsonb
      FROM updated
      JOIN previous ON previous.id = updated.id
      WHERE previous.name IS DISTINCT FROM updated.name
        OR previous.nucleus IS DISTINCT FROM updated.nucleus
        OR previous.account_head IS DISTINCT FROM updated.account_head
        OR previous.direction IS DISTINCT FROM updated.direction
    )
    SELECT
      updated.*,
      COALESCE((
        SELECT count(*)
        FROM client_pendencies p
        WHERE p.client_account_id = updated.id AND p.completed_at IS NULL
      ), 0) AS open_pendencies
    FROM updated
  `) as Row[];
  return rows[0] ? mapAccount(rows[0]) : null;
}
