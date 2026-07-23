import "server-only";

import { neon } from "@neondatabase/serverless";
import { DEMO_LEADS } from "@/lib/demo-data";
import { normalizeLeadOrigin } from "@/lib/lead-origin";
import type { Lead, LeadStatus } from "@/types/lead";

type LeadInput = Omit<Lead, "id" | "updatedAt"> & {
  id?: string;
  updatedAt?: string;
};

export function isLiveMode() {
  return Boolean(process.env.DATABASE_URL);
}

function getSql() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada.");
  }
  return neon(connectionString);
}

function mapRow(row: Record<string, unknown>): Lead {
  return {
    id: String(row.id),
    rdUuid: row.rd_uuid ? String(row.rd_uuid) : null,
    name: String(row.name),
    company: row.company ? String(row.company) : "",
    email: String(row.email),
    phone: row.phone ? String(row.phone) : "",
    origin: normalizeLeadOrigin(row.origin ? String(row.origin) : ""),
    enteredAt: new Date(String(row.entered_at)).toISOString(),
    status: String(row.status) as LeadStatus,
    notes: row.notes ? String(row.notes) : "",
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function listLeads(): Promise<Lead[]> {
  if (!isLiveMode()) {
    return DEMO_LEADS;
  }

  const sql = getSql();
  const rows = await sql`
    SELECT id, rd_uuid, name, company, email, phone, origin, entered_at, status, notes, updated_at
    FROM leads
    ORDER BY entered_at DESC
    LIMIT 2000
  `;
  return rows.map((row) => mapRow(row));
}

export async function updateLeadStatus(id: string, status: LeadStatus) {
  if (!isLiveMode()) {
    throw new Error("A demonstração não persiste alterações.");
  }

  const sql = getSql();
  const rows = await sql`
    UPDATE leads
    SET status = ${status}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, rd_uuid, name, company, email, phone, origin, entered_at, status, notes, updated_at
  `;
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function updateLeadNotes(id: string, notes: string) {
  if (!isLiveMode()) {
    throw new Error("A demonstração não persiste alterações.");
  }

  const sql = getSql();
  const rows = await sql`
    UPDATE leads
    SET notes = ${notes}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, rd_uuid, name, company, email, phone, origin, entered_at, status, notes, updated_at
  `;
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function upsertLeads(inputs: LeadInput[]) {
  if (!isLiveMode()) {
    throw new Error("Configure DATABASE_URL antes de importar contatos reais.");
  }

  const sql = getSql();
  let imported = 0;
  const validInputs = inputs.filter((lead) => lead.rdUuid && lead.email);

  for (let index = 0; index < validInputs.length; index += 250) {
    const batch = validInputs.slice(index, index + 250).map((lead) => ({
      rd_uuid: lead.rdUuid,
      name: lead.name || lead.email,
      company: lead.company || "",
      email: lead.email,
      phone: lead.phone || "",
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
          origin text,
          entered_at timestamptz,
          status text
        )
      )
      INSERT INTO leads (
        rd_uuid,
        name,
        company,
        email,
        phone,
        origin,
        entered_at,
        status,
        updated_at
      )
      SELECT
        rd_uuid,
        name,
        company,
        email,
        phone,
        origin,
        entered_at,
        status,
        NOW()
      FROM incoming
      ON CONFLICT (rd_uuid)
      DO UPDATE SET
        name = EXCLUDED.name,
        company = EXCLUDED.company,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        origin = EXCLUDED.origin,
        entered_at = LEAST(leads.entered_at, EXCLUDED.entered_at),
        updated_at = NOW()
    `;
    imported += batch.length;
  }

  return imported;
}
