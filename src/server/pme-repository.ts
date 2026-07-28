import "server-only";

import { randomUUID } from "node:crypto";
import { normalizeCompany } from "@/lib/lead-normalization";
import { getSql } from "@/server/db";
import { isLiveMode } from "@/server/lead-repository";
import type { PmeCompany, PmeCompanyDetails, PmeCompanyRecord, PmeDirectoryData, PmeImportRecord } from "@/types/pme";

type Row = Record<string, unknown>;

export type PmeImportInput = {
  fileName: string;
  fileHash: string;
  records: PmeImportRecord[];
  ignoredRows: number;
  sourceSheets: string[];
};

function mapCompany(row: Row): PmeCompany {
  return {
    normalizedCompany: String(row.normalized_company),
    companyName: String(row.company_name),
    contacts: String(row.contacts ?? ""),
    phones: String(row.phones ?? ""),
    website: String(row.website ?? ""),
    latestStatus: String(row.latest_status ?? ""),
    latestActivityAt: row.latest_activity_at
      ? new Date(String(row.latest_activity_at)).toISOString()
      : null,
    historicValue: row.historic_value === null || row.historic_value === undefined
      ? null
      : Number(row.historic_value),
    notes: String(row.notes ?? ""),
    categories: Array.isArray(row.categories) ? row.categories.map(String) : [],
    sourceSheets: Array.isArray(row.source_sheets) ? row.source_sheets.map(String) : [],
    recordCount: Number(row.record_count ?? 0),
  };
}

function mapCompanyRecord(row: Row): PmeCompanyRecord {
  return {
    id: String(row.id),
    sourceSheet: String(row.source_sheet),
    sourceRow: Number(row.source_row),
    category: String(row.category),
    contactName: String(row.contact_name ?? ""),
    phone: String(row.phone ?? ""),
    website: String(row.website ?? ""),
    historicStatus: String(row.historic_status ?? ""),
    historicValue: row.historic_value === null || row.historic_value === undefined ? null : Number(row.historic_value),
    recordedAt: row.recorded_at ? new Date(String(row.recorded_at)).toISOString() : null,
    contactAt: row.contact_at ? new Date(String(row.contact_at)).toISOString() : null,
    displayedAt: row.displayed_at ? new Date(String(row.displayed_at)).toISOString() : null,
    notes: String(row.notes ?? ""),
    sourceData: row.source_data && typeof row.source_data === "object" ? row.source_data as Record<string, string> : {},
  };
}

const companyQuery = `
  WITH grouped AS (
    SELECT
      normalized_company,
      (array_agg(company_name ORDER BY char_length(company_name) DESC, created_at DESC))[1] AS company_name,
      string_agg(DISTINCT NULLIF(contact_name, ''), ' · ') AS contacts,
      string_agg(DISTINCT NULLIF(phone, ''), ' · ') AS phones,
      (array_agg(NULLIF(website, '') ORDER BY created_at DESC) FILTER (WHERE website <> ''))[1] AS website,
      (array_agg(NULLIF(historic_status, '') ORDER BY COALESCE(contact_at, displayed_at, recorded_at) DESC NULLS LAST, created_at DESC) FILTER (WHERE historic_status <> ''))[1] AS latest_status,
      MAX(COALESCE(contact_at, displayed_at, recorded_at)) AS latest_activity_at,
      MAX(historic_value) AS historic_value,
      (array_agg(NULLIF(notes, '') ORDER BY COALESCE(contact_at, displayed_at, recorded_at) DESC NULLS LAST, created_at DESC) FILTER (WHERE notes <> ''))[1] AS notes,
      array_agg(DISTINCT category) AS categories,
      array_agg(DISTINCT source_sheet) AS source_sheets,
      count(*)::int AS record_count
    FROM pme_reactivation_records
    GROUP BY normalized_company
  )
  SELECT * FROM grouped
  ORDER BY latest_activity_at DESC NULLS LAST, company_name ASC
`;

export async function getPmeDirectory(): Promise<PmeDirectoryData> {
  if (!isLiveMode()) return { companies: [], importedRecords: 0, latestImportAt: null };
  const sql = getSql();
  const [companies, totals] = await Promise.all([
    sql.query(companyQuery) as Promise<Row[]>,
    sql.query("SELECT COALESCE(SUM(imported_rows), 0)::int AS imported_records, max(created_at) AS latest_import_at FROM pme_import_batches") as Promise<Row[]>,
  ]);
  const summary = totals[0] ?? {};
  return {
    companies: companies.map(mapCompany),
    importedRecords: Number(summary.imported_records ?? 0),
    latestImportAt: summary.latest_import_at ? new Date(String(summary.latest_import_at)).toISOString() : null,
  };
}

export async function getPmeCompanyDetails(normalizedCompany: string): Promise<PmeCompanyDetails | null> {
  if (!isLiveMode()) return null;
  const sql = getSql();
  const [companies, records] = await Promise.all([
    sql.query(`${companyQuery.replace("GROUP BY normalized_company", "WHERE normalized_company = $1 GROUP BY normalized_company")}`, [normalizedCompany]) as Promise<Row[]>,
    sql.query(`
      SELECT id, source_sheet, source_row, category, contact_name, phone, website,
        historic_status, historic_value, recorded_at, contact_at, displayed_at, notes, source_data
      FROM pme_reactivation_records
      WHERE normalized_company = $1
      ORDER BY COALESCE(contact_at, displayed_at, recorded_at) DESC NULLS LAST, source_sheet, source_row
      LIMIT 1000
    `, [normalizedCompany]) as Promise<Row[]>,
  ]);
  const company = companies[0];
  return company ? { ...mapCompany(company), records: records.map(mapCompanyRecord) } : null;
}

export async function importPmeRecords(input: PmeImportInput, actor?: { userId?: string; email?: string; name?: string }) {
  if (!isLiveMode()) throw new Error("Configure o banco antes de importar a base PME.");
  const sql = getSql();
  const existing = (await sql.query(
    "SELECT id, imported_rows FROM pme_import_batches WHERE file_hash = $1 LIMIT 1",
    [input.fileHash],
  )) as Row[];
  if (existing[0]) {
    return { imported: 0, ignored: input.ignoredRows, alreadyImported: true, batchId: String(existing[0].id) };
  }

  const prepared = input.records.map((record) => ({
    source_sheet: record.sourceSheet,
    source_row: record.sourceRow,
    category: record.category,
    company_name: record.companyName,
    normalized_company: normalizeCompany(record.companyName),
    contact_name: record.contactName,
    phone: record.phone,
    website: record.website,
    historic_status: record.historicStatus,
    historic_value: record.historicValue,
    recorded_at: record.recordedAt,
    contact_at: record.contactAt,
    displayed_at: record.displayedAt,
    notes: record.notes,
    source_data: record.sourceData,
  })).filter((record) => record.normalized_company);
  const batchId = randomUUID();

  await sql.transaction([
    sql`
      INSERT INTO pme_import_batches (
        id, file_name, file_hash, imported_by, imported_by_email,
        total_rows, imported_rows, ignored_rows, source_sheets
      ) VALUES (
        ${batchId}::uuid, ${input.fileName}, ${input.fileHash}, ${actor?.userId ?? null}::uuid,
        ${actor?.email ?? null}, ${input.records.length + input.ignoredRows},
        ${prepared.length}, ${input.ignoredRows}, ${JSON.stringify(input.sourceSheets)}::jsonb
      )
    `,
    sql`
      INSERT INTO pme_reactivation_records (
        import_batch_id, source_sheet, source_row, category, company_name,
        normalized_company, contact_name, phone, website, historic_status,
        historic_value, recorded_at, contact_at, displayed_at, notes, source_data
      )
      SELECT
        ${batchId}::uuid, source_sheet, source_row, category, company_name,
        normalized_company, contact_name, phone, website, historic_status,
        historic_value, recorded_at, contact_at, displayed_at, notes, source_data
      FROM jsonb_to_recordset(${JSON.stringify(prepared)}::jsonb) AS item(
        source_sheet text, source_row integer, category text, company_name text,
        normalized_company text, contact_name text, phone text, website text,
        historic_status text, historic_value numeric, recorded_at date, contact_at date,
        displayed_at date, notes text, source_data jsonb
      )
    `,
    sql`
      INSERT INTO audit_log (actor_user_id, actor_email, action, entity_type, entity_id, metadata)
      VALUES (
        ${actor?.userId ?? null}::uuid, ${actor?.email ?? null}, 'pme.imported', 'pme_import',
        ${batchId}, jsonb_build_object(
          'title', 'Base PME importada',
          'description', ${`${prepared.length} registros foram adicionados ao diretório PME.`},
          'actorName', ${actor?.name ?? actor?.email ?? 'Sistema'}
        )
      )
    `,
  ]);

  return { imported: prepared.length, ignored: input.ignoredRows, alreadyImported: false, batchId };
}
