import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeCompany, normalizeEmail, normalizePhone } from "@/lib/lead-normalization";
import { getSql } from "@/server/db";
import { getMetaAccessToken } from "@/server/meta-oauth";

type MetaLeadChange = { field?: unknown; value?: { leadgen_id?: unknown; page_id?: unknown; form_id?: unknown } };
type MetaWebhookPayload = { object?: unknown; entry?: Array<{ id?: unknown; changes?: MetaLeadChange[] }> };
type MetaFieldData = { name?: unknown; values?: unknown };
type MetaLeadPayload = {
  id?: unknown;
  created_time?: unknown;
  ad_id?: unknown;
  ad_name?: unknown;
  adset_id?: unknown;
  adset_name?: unknown;
  campaign_id?: unknown;
  campaign_name?: unknown;
  form_id?: unknown;
  field_data?: MetaFieldData[];
};

type StoredWebhookEvent = { leadgen_id: string; page_id: string | null };

const META_GRAPH_BASE = "https://graph.facebook.com";

export function metaWebhookVerifyToken() {
  return process.env.META_WEBHOOK_VERIFY_TOKEN ?? "";
}

export function hasValidMetaWebhookSignature(rawBody: string, signature: string | null) {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signature.slice("sha256=".length);
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(received, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

function graphVersion() {
  return process.env.META_GRAPH_API_VERSION || "v25.0";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function normalizeFieldName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function fieldValues(fieldData: MetaFieldData[] | undefined) {
  const fields: Record<string, string> = {};
  for (const field of fieldData ?? []) {
    const name = normalizeFieldName(stringValue(field.name));
    if (!name) continue;
    const rawValues = Array.isArray(field.values) ? field.values : [];
    const values = rawValues.map(stringValue).filter(Boolean);
    if (values.length) fields[name] = values.join(" · ");
  }
  return fields;
}

function firstField(fields: Record<string, string>, names: string[]) {
  for (const name of names) {
    if (fields[name]) return fields[name];
  }
  return "";
}

function inputFromMetaLead(leadgenId: string, pageId: string | null, payload: MetaLeadPayload) {
  const fields = fieldValues(payload.field_data);
  const fullName = firstField(fields, ["full_name", "nome_completo", "name", "nome"]);
  const firstName = firstField(fields, ["first_name", "primeiro_nome"]);
  const lastName = firstField(fields, ["last_name", "sobrenome"]);
  const email = firstField(fields, ["email", "email_address", "e_mail"]);
  const phone = firstField(fields, ["phone_number", "phone", "telefone", "whatsapp", "celular", "mobile_phone"]);
  const company = firstField(fields, ["company_name", "company", "empresa", "business_name", "nome_da_empresa"]);
  const name = fullName || [firstName, lastName].filter(Boolean).join(" ") || company || email || phone || `Lead Meta ${leadgenId.slice(-8)}`;
  const createdAt = stringValue(payload.created_time);
  const enteredAt = createdAt && !Number.isNaN(Date.parse(createdAt)) ? new Date(createdAt).toISOString() : new Date().toISOString();

  return {
    leadgenId,
    pageId,
    name,
    company,
    email,
    phone,
    enteredAt,
    additionalData: {
      metaLeadgenId: leadgenId,
      metaPageId: pageId ?? "",
      metaFormId: stringValue(payload.form_id),
      metaCampaignId: stringValue(payload.campaign_id),
      metaCampaignName: stringValue(payload.campaign_name),
      metaAdSetId: stringValue(payload.adset_id),
      metaAdSetName: stringValue(payload.adset_name),
      metaAdId: stringValue(payload.ad_id),
      metaAdName: stringValue(payload.ad_name),
      ...fields,
    },
  };
}

async function fetchMetaLead(leadgenId: string) {
  const accessToken = await getMetaAccessToken();
  const url = new URL(`${META_GRAPH_BASE}/${graphVersion()}/${encodeURIComponent(leadgenId)}`);
  url.searchParams.set("fields", "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data");
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`A Meta não liberou os dados do formulário (${response.status})${detail ? `: ${detail.slice(0, 220)}` : ""}.`);
  }
  return await response.json() as MetaLeadPayload;
}

async function saveMetaLead(event: StoredWebhookEvent) {
  const payload = await fetchMetaLead(event.leadgen_id);
  const lead = inputFromMetaLead(event.leadgen_id, event.page_id, payload);
  const sql = getSql();
  const rows = await sql`
    INSERT INTO leads (
      meta_leadgen_id, name, company, email, phone, normalized_email,
      normalized_phone, normalized_company, origin, entered_at, status,
      additional_data, source_type, source_label, updated_at
    ) VALUES (
      ${lead.leadgenId}, ${lead.name}, ${lead.company}, ${lead.email}, ${lead.phone},
      ${normalizeEmail(lead.email)}, ${normalizePhone(lead.phone)}, ${normalizeCompany(lead.company)},
      'Meta Ads', ${lead.enteredAt}, 'pending', ${JSON.stringify(lead.additionalData)}::jsonb,
      'meta', 'Meta Lead Ads', NOW()
    )
    ON CONFLICT (meta_leadgen_id) WHERE meta_leadgen_id IS NOT NULL
    DO UPDATE SET
      name = EXCLUDED.name,
      company = COALESCE(NULLIF(EXCLUDED.company, ''), leads.company),
      email = COALESCE(NULLIF(EXCLUDED.email, ''), leads.email),
      phone = COALESCE(NULLIF(EXCLUDED.phone, ''), leads.phone),
      normalized_email = COALESCE(NULLIF(EXCLUDED.normalized_email, ''), leads.normalized_email),
      normalized_phone = COALESCE(NULLIF(EXCLUDED.normalized_phone, ''), leads.normalized_phone),
      normalized_company = COALESCE(NULLIF(EXCLUDED.normalized_company, ''), leads.normalized_company),
      additional_data = COALESCE(leads.additional_data, '{}'::jsonb) || EXCLUDED.additional_data,
      source_type = 'meta',
      source_label = 'Meta Lead Ads',
      updated_at = NOW()
    RETURNING id
  ` as Array<{ id: string }>;

  await sql`
    INSERT INTO audit_log (action, entity_type, entity_id, metadata)
    VALUES (
      'lead.meta_captured', 'lead', ${rows[0]?.id ?? event.leadgen_id},
      ${JSON.stringify({
        title: "Lead recebido da Meta Ads",
        description: "Registro criado automaticamente a partir de um formulário de Lead Ads.",
        actorName: "Integração Meta Ads",
      })}::jsonb
    )
  `;
}

export async function storeMetaLeadWebhook(rawBody: string) {
  const payload = JSON.parse(rawBody) as MetaWebhookPayload;
  if (payload.object !== "page") return { stored: 0, events: [] as StoredWebhookEvent[] };
  const sql = getSql();
  const events: StoredWebhookEvent[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;
      const leadgenId = typeof change.value?.leadgen_id === "string" ? change.value.leadgen_id : "";
      if (!leadgenId) continue;
      const pageId = typeof change.value?.page_id === "string" ? change.value.page_id : typeof entry.id === "string" ? entry.id : null;
      const inserted = await sql`
        INSERT INTO meta_lead_webhook_events (event_key, page_id, leadgen_id, payload)
        VALUES (${leadgenId}, ${pageId}, ${leadgenId}, ${rawBody}::jsonb)
        ON CONFLICT (event_key) DO NOTHING
        RETURNING leadgen_id, page_id
      ` as StoredWebhookEvent[];
      if (inserted[0]) events.push(inserted[0]);
    }
  }
  return { stored: events.length, events };
}

export async function processMetaLeadWebhookEvents(events: StoredWebhookEvent[]) {
  const sql = getSql();
  const result = { processed: 0, failed: 0 };
  for (const event of events) {
    try {
      await saveMetaLead(event);
      await sql`
        UPDATE meta_lead_webhook_events
        SET processed_at = NOW(), processing_error = NULL
        WHERE event_key = ${event.leadgen_id}
      `;
      result.processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido ao importar o lead da Meta.";
      await sql`
        UPDATE meta_lead_webhook_events
        SET processing_error = ${message.slice(0, 1000)}
        WHERE event_key = ${event.leadgen_id}
      `;
      console.error("[meta/lead-webhook] processing failed", { leadgenId: event.leadgen_id, error: message });
      result.failed += 1;
    }
  }
  return result;
}
