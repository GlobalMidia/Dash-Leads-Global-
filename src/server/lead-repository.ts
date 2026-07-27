import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { DEMO_LEADS } from "@/lib/demo-data";
import type { CsvImportRecord } from "@/lib/csv-import";
import {
  normalizeCompany,
  normalizeEmail,
  normalizePhone,
} from "@/lib/lead-normalization";
import { normalizeLeadOrigin, type LeadOrigin } from "@/lib/lead-origin";
import { getSql } from "@/server/db";
import {
  STATUS_LABELS,
  type Lead,
  type LeadHistoryEvent,
  type LeadStatus,
} from "@/types/lead";

type LeadInput = Omit<Lead, "id" | "updatedAt"> & {
  id?: string;
  updatedAt?: string;
};

export type AuditActor = {
  userId?: string;
  email?: string;
  name?: string;
};

export type LeadPatch = {
  status?: LeadStatus;
  origin?: LeadOrigin;
  notes?: string;
};

export type CsvImportInput = {
  fileName: string;
  records: CsvImportRecord[];
  groupedRowNumbers: number[];
};

type DatabaseRow = Record<string, unknown>;

export function isPublicPrototypeMode() {
  return process.env.PUBLIC_PROTOTYPE === "true";
}

export function isLiveMode() {
  return !isPublicPrototypeMode() && Boolean(process.env.DATABASE_URL);
}

function asObject(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, String(item ?? "")]),
  );
}

function asHistory(value: unknown): LeadHistoryEvent[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item as DatabaseRow;
    return {
      id: String(row.id),
      title: String(row.title),
      description: String(row.description ?? ""),
      actor: String(row.actor ?? "Sistema"),
      actorEmail: row.actorEmail ? String(row.actorEmail) : undefined,
      occurredAt: new Date(String(row.occurredAt)).toISOString(),
    };
  });
}

function mapRow(row: DatabaseRow): Lead {
  const sourceType = String(row.source_type ?? "manual") as
    | "rd"
    | "csv"
    | "manual";
  const sourceFile = row.import_file_name
    ? String(row.import_file_name)
    : undefined;

  return {
    id: String(row.id),
    rdUuid: row.rd_uuid ? String(row.rd_uuid) : null,
    name: String(row.name),
    company: row.company ? String(row.company) : "",
    email: row.email ? String(row.email) : "",
    phone: row.phone ? String(row.phone) : "",
    origin: normalizeLeadOrigin(row.origin ? String(row.origin) : ""),
    enteredAt: new Date(String(row.entered_at)).toISOString(),
    status: String(row.status) as LeadStatus,
    notes: row.notes ? String(row.notes) : "",
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    source: {
      type: sourceType,
      label: String(
        row.source_label ??
          (sourceType === "rd"
            ? "RD Station"
            : sourceType === "csv"
              ? "Importação CSV"
              : "Cadastro manual"),
      ),
      fileName: sourceFile,
      importedAt: row.imported_at
        ? new Date(String(row.imported_at)).toISOString()
        : undefined,
      importedBy: row.imported_by_email
        ? String(row.imported_by_email)
        : undefined,
    },
    companyGroupId: row.duplicate_group_id
      ? String(row.duplicate_group_id)
      : undefined,
    duplicateStatus: row.duplicate_status
      ? (String(row.duplicate_status) as "potential" | "confirmed")
      : undefined,
    additionalData: asObject(row.additional_data),
    history: asHistory(row.history),
  };
}

const leadSelect = `
  SELECT
    l.*,
    ib.file_name AS import_file_name,
    ib.created_at AS imported_at,
    ib.imported_by_email,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', a.id::text,
            'title', COALESCE(a.metadata->>'title', a.action),
            'description', COALESCE(a.metadata->>'description', ''),
            'actor', COALESCE(a.metadata->>'actorName', a.actor_email::text, 'Sistema'),
            'actorEmail', a.actor_email::text,
            'occurredAt', a.created_at
          )
          ORDER BY a.created_at DESC
        )
        FROM audit_log a
        WHERE a.entity_type = 'lead' AND a.entity_id = l.id::text
      ),
      '[]'::jsonb
    ) AS history
  FROM leads l
  LEFT JOIN import_batches ib ON ib.id = l.import_batch_id
`;

export async function listLeads(): Promise<Lead[]> {
  if (!isLiveMode()) return DEMO_LEADS;

  const sql = getSql();
  const rows = (await sql.query(
    // O RD pode devolver dezenas de milhares de contatos. O painel faz a
    // paginação visual no navegador; limitar a consulta aqui fazia o número
    // ficar preso exatamente em 2.000, mesmo quando a sincronização continuava.
    `${leadSelect} ORDER BY l.entered_at DESC`,
  )) as DatabaseRow[];
  return rows.map((row) => mapRow(row));
}

export async function updateLead(
  id: string,
  patch: LeadPatch,
  actor: AuditActor = {},
) {
  if (!isLiveMode()) {
    throw new Error("A demonstração não persiste alterações.");
  }

  const sql = getSql();
  const status = patch.status ?? null;
  const origin = patch.origin ?? null;
  const notes = patch.notes ?? null;
  const title = patch.status
    ? "Qualificação alterada"
    : "Observação atualizada";
  const description = patch.status
    ? `O lead foi marcado como ${STATUS_LABELS[patch.status].toLocaleLowerCase("pt-BR")}.`
    : patch.notes
      ? "O conteúdo das observações foi atualizado."
      : "As observações do lead foram removidas.";

  const rows = (await sql`
    WITH previous AS MATERIALIZED (
      SELECT *
      FROM leads
      WHERE id = ${id}::uuid
      FOR UPDATE
    ),
    updated AS (
      UPDATE leads
      SET
        status = COALESCE(${status}, status),
        origin = COALESCE(${origin}, origin),
        notes = COALESCE(${notes}, notes),
        updated_at = NOW()
      WHERE id = ${id}::uuid
      RETURNING *
    ),
    logged AS (
      INSERT INTO audit_log (
        actor_user_id,
        actor_email,
        action,
        entity_type,
        entity_id,
        before_data,
        after_data,
        metadata
      )
      SELECT
        ${actor.userId ?? null}::uuid,
        ${actor.email ?? null},
        ${patch.status ? "lead.status_updated" : patch.origin ? "lead.origin_updated" : "lead.notes_updated"},
        'lead',
        updated.id::text,
        to_jsonb(previous),
        to_jsonb(updated),
        ${JSON.stringify({
          title,
          description,
          actorName: actor.name ?? actor.email ?? "Sistema",
        })}::jsonb
      FROM updated
      JOIN previous ON previous.id = updated.id
    )
    SELECT * FROM updated
  `) as DatabaseRow[];

  if (!rows[0]) return null;
  const refreshed = (await sql.query(
    `${leadSelect} WHERE l.id = $1::uuid`,
    [id],
  )) as DatabaseRow[];
  return refreshed[0] ? mapRow(refreshed[0]) : null;
}

export async function updateLeadStatus(
  id: string,
  status: LeadStatus,
  actor?: AuditActor,
) {
  return updateLead(id, { status }, actor);
}

export async function updateLeadNotes(
  id: string,
  notes: string,
  actor?: AuditActor,
) {
  return updateLead(id, { notes }, actor);
}

export async function importCsvLeads(
  input: CsvImportInput,
  actor: AuditActor = {},
) {
  if (!isLiveMode()) {
    throw new Error("Configure DATABASE_URL antes de importar contatos reais.");
  }

  const sql = getSql();
  const batchId = randomUUID();
  const importedAt = new Date().toISOString();
  const groupedRows = new Set(input.groupedRowNumbers);
  const requestedMatches = [
    ...new Set(
      input.records
        .filter(
          (record) =>
            record.match?.kind === "company" &&
            record.match.matchedLeadId &&
            groupedRows.has(record.rowNumber),
        )
        .map((record) => record.match?.matchedLeadId as string),
    ),
  ];
  const existingMatches = (requestedMatches.length
    ? await sql`
        SELECT id, duplicate_group_id, normalized_company
        FROM leads
        WHERE id = ANY(${requestedMatches}::uuid[])
      `
    : []) as DatabaseRow[];
  const existingById = new Map(
    existingMatches.map((row) => [String(row.id), row]),
  );
  const groupByCompany = new Map<string, string>();
  const existingGroupUpdates = new Map<string, string>();

  for (const record of input.records) {
    if (
      record.match?.kind !== "company" ||
      !record.match.matchedLeadId ||
      !groupedRows.has(record.rowNumber)
    ) {
      continue;
    }

    const existing = existingById.get(record.match.matchedLeadId);
    if (!existing) continue;
    const company = normalizeCompany(record.company);
    const groupId = existing.duplicate_group_id
      ? String(existing.duplicate_group_id)
      : groupByCompany.get(company) ?? randomUUID();
    groupByCompany.set(company, groupId);
    existingGroupUpdates.set(record.match.matchedLeadId, groupId);
  }

  const leadRows = input.records.map((record) => {
    const normalizedCompany = normalizeCompany(record.company);
    const duplicateGroupId = groupByCompany.get(normalizedCompany) ?? null;
    return {
      id: randomUUID(),
      rd_uuid: null,
      name: record.name,
      company: record.company,
      email: record.email,
      phone: record.phone,
      normalized_email: normalizeEmail(record.email),
      normalized_phone: normalizePhone(record.phone),
      normalized_company: normalizedCompany,
      origin: normalizeLeadOrigin(record.origin),
      entered_at: record.enteredAt,
      status: record.status,
      notes: record.notes.slice(0, 280),
      source_type: "csv",
      source_label: "Importação CSV",
      import_batch_id: batchId,
      duplicate_group_id: duplicateGroupId,
      duplicate_status: record.match
        ? duplicateGroupId
          ? "confirmed"
          : "potential"
        : null,
      additional_data: record.additionalData,
      row_number: record.rowNumber,
    };
  });
  const groupRows = [...new Set(groupByCompany.values())].map((id) => {
    const normalizedCompany =
      [...groupByCompany.entries()].find(([, groupId]) => groupId === id)?.[0] ??
      "";
    return { id, normalized_company: normalizedCompany };
  });
  const existingUpdateRows = [...existingGroupUpdates].map(([id, groupId]) => ({
    id,
    group_id: groupId,
  }));
  const fileHash = createHash("sha256")
    .update(JSON.stringify(input.records))
    .digest("hex");
  const queries = [
    sql`
      INSERT INTO import_batches (
        id, file_name, file_hash, imported_by, imported_by_email,
        total_rows, imported_rows, ignored_rows, grouped_rows
      )
      VALUES (
        ${batchId}::uuid,
        ${input.fileName},
        ${fileHash},
        ${actor.userId ?? null}::uuid,
        ${actor.email ?? null},
        ${input.records.length},
        ${leadRows.length},
        0,
        ${groupedRows.size}
      )
    `,
  ];

  if (groupRows.length) {
    queries.push(sql`
      INSERT INTO duplicate_groups (
        id, status, normalized_company, created_by, source_import_id
      )
      SELECT
        item.id::uuid,
        'confirmed',
        item.normalized_company,
        ${actor.userId ?? null}::uuid,
        ${batchId}::uuid
      FROM jsonb_to_recordset(${JSON.stringify(groupRows)}::jsonb) AS item(
        id text,
        normalized_company text
      )
      ON CONFLICT (id) DO NOTHING
    `);
  }

  if (existingUpdateRows.length) {
    queries.push(sql`
      WITH incoming AS (
        SELECT *
        FROM jsonb_to_recordset(${JSON.stringify(existingUpdateRows)}::jsonb)
          AS item(id text, group_id text)
      ),
      previous AS MATERIALIZED (
        SELECT leads.*
        FROM leads
        JOIN incoming ON leads.id = incoming.id::uuid
        FOR UPDATE
      ),
      updated AS (
        UPDATE leads
        SET
          duplicate_group_id = incoming.group_id::uuid,
          duplicate_status = 'confirmed',
          updated_at = NOW()
        FROM incoming
        WHERE leads.id = incoming.id::uuid
        RETURNING leads.*
      )
      INSERT INTO audit_log (
        actor_user_id, actor_email, action, entity_type, entity_id,
        before_data, after_data, metadata
      )
      SELECT
        ${actor.userId ?? null}::uuid,
        ${actor.email ?? null},
        'lead.company_grouped',
        'lead',
        updated.id::text,
        to_jsonb(previous),
        to_jsonb(updated),
        jsonb_build_object(
          'title', 'Empresa agrupada sem fusão',
          'description', 'Agrupamento confirmado durante a importação de ' || ${input.fileName} || '.',
          'actorName', ${actor.name ?? actor.email ?? "Sistema"}
        )
      FROM updated
      JOIN previous ON previous.id = updated.id
    `);
  }

  queries.push(sql`
    WITH incoming AS (
      SELECT *
      FROM jsonb_to_recordset(${JSON.stringify(leadRows)}::jsonb) AS item(
        id text,
        rd_uuid text,
        name text,
        company text,
        email text,
        phone text,
        normalized_email text,
        normalized_phone text,
        normalized_company text,
        origin text,
        entered_at timestamptz,
        status text,
        notes text,
        source_type text,
        source_label text,
        import_batch_id text,
        duplicate_group_id text,
        duplicate_status text,
        additional_data jsonb,
        row_number integer
      )
    )
    INSERT INTO leads (
      id, rd_uuid, name, company, email, phone, normalized_email,
      normalized_phone, normalized_company, origin, entered_at, status,
      notes, source_type, source_label, import_batch_id, duplicate_group_id,
      duplicate_status, additional_data, updated_at
    )
    SELECT
      id::uuid, rd_uuid, name, company, email, phone, normalized_email,
      normalized_phone, normalized_company, origin, entered_at, status,
      notes, source_type, source_label, import_batch_id::uuid,
      duplicate_group_id::uuid, duplicate_status, additional_data, NOW()
    FROM incoming
  `);
  queries.push(sql`
    WITH incoming AS (
      SELECT *
      FROM jsonb_to_recordset(${JSON.stringify(leadRows)}::jsonb) AS item(
        id text,
        name text,
        row_number integer
      )
    )
    INSERT INTO audit_log (
      actor_user_id, actor_email, action, entity_type, entity_id,
      after_data, metadata
    )
    SELECT
      ${actor.userId ?? null}::uuid,
      ${actor.email ?? null},
      'lead.imported',
      'lead',
      incoming.id,
      jsonb_build_object('name', incoming.name, 'importBatchId', ${batchId}),
      jsonb_build_object(
        'title', 'Lead importado',
        'description', 'Linha ' || incoming.row_number || ' do arquivo ' || ${input.fileName} || '.',
        'actorName', ${actor.name ?? actor.email ?? "Sistema"}
      )
    FROM incoming
  `);
  if (leadRows.some((lead) => lead.duplicate_status === "confirmed")) {
    queries.push(sql`
      WITH incoming AS (
        SELECT *
        FROM jsonb_to_recordset(${JSON.stringify(leadRows)}::jsonb) AS item(
          id text,
          duplicate_status text
        )
      )
      INSERT INTO audit_log (
        actor_user_id, actor_email, action, entity_type, entity_id, metadata
      )
      SELECT
        ${actor.userId ?? null}::uuid,
        ${actor.email ?? null},
        'lead.company_grouped',
        'lead',
        incoming.id,
        jsonb_build_object(
          'title', 'Empresa agrupada sem fusão',
          'description', 'A empresa foi confirmada como a mesma de outro registro. Os leads permanecem separados.',
          'actorName', ${actor.name ?? actor.email ?? "Sistema"}
        )
      FROM incoming
      WHERE incoming.duplicate_status = 'confirmed'
    `);
  }

  await sql.transaction(queries);
  return {
    batchId,
    imported: leadRows.length,
    grouped: groupedRows.size,
    importedAt,
  };
}

export async function upsertLeads(inputs: LeadInput[]) {
  if (!isLiveMode()) {
    throw new Error("Configure DATABASE_URL antes de importar contatos reais.");
  }

  const sql = getSql();
  let imported = 0;
  const validInputs = inputs.filter(
    (lead) => lead.rdUuid && (lead.email || lead.phone),
  );

  for (let index = 0; index < validInputs.length; index += 250) {
    const batch = validInputs.slice(index, index + 250).map((lead) => ({
      rd_uuid: lead.rdUuid,
      name: lead.name || lead.email || lead.phone,
      company: lead.company || "",
      email: lead.email || "",
      phone: lead.phone || "",
      normalized_email: normalizeEmail(lead.email || ""),
      normalized_phone: normalizePhone(lead.phone || ""),
      normalized_company: normalizeCompany(lead.company || ""),
      origin: normalizeLeadOrigin(lead.origin),
      entered_at: lead.enteredAt,
      status: lead.status,
    }));

    await sql`
      WITH incoming AS (
        SELECT *
        FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS item(
          rd_uuid text,
          name text,
          company text,
          email text,
          phone text,
          normalized_email text,
          normalized_phone text,
          normalized_company text,
          origin text,
          entered_at timestamptz,
          status text
        )
      )
      INSERT INTO leads (
        rd_uuid, name, company, email, phone, normalized_email,
        normalized_phone, normalized_company, origin, entered_at, status,
        source_type, source_label, updated_at
      )
      SELECT
        rd_uuid, name, company, email, phone, normalized_email,
        normalized_phone, normalized_company, origin, entered_at, status,
        'rd', 'RD Station', NOW()
      FROM incoming
      ON CONFLICT (rd_uuid)
      DO UPDATE SET
        name = EXCLUDED.name,
        company = EXCLUDED.company,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        normalized_email = EXCLUDED.normalized_email,
        normalized_phone = EXCLUDED.normalized_phone,
        normalized_company = EXCLUDED.normalized_company,
        origin = EXCLUDED.origin,
        entered_at = LEAST(leads.entered_at, EXCLUDED.entered_at),
        source_type = 'rd',
        source_label = 'RD Station',
        updated_at = NOW()
    `;
    imported += batch.length;
  }

  return imported;
}
