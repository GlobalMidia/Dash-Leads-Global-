import "server-only";

import { normalizeCompany, normalizeEmail, normalizePhone } from "@/lib/lead-normalization";
import {
  inferProjectUnit,
  inferSiteLeadOrigin,
  scoreSiteJourney,
  type SiteEventName,
  type SiteJourney,
  type SiteJourneyEvent,
} from "@/lib/site-journey";
import { getSql } from "@/server/db";
import type { LeadProjectUnit } from "@/types/lead";

export type SiteTrackingAttribution = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  gclid?: string;
  fbclid?: string;
};

export type SiteTrackingEventInput = {
  id: string;
  name: SiteEventName;
  occurredAt: string;
  pageUrl: string;
  pageTitle?: string;
  referrer?: string;
  data?: Record<string, string>;
};

export type SiteTrackingBatch = {
  visitorId: string;
  sessionId: string;
  sessionStartedAt: string;
  attribution: SiteTrackingAttribution;
  landingPage: string;
  events: SiteTrackingEventInput[];
  identity?: {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
  };
};

type DatabaseRow = Record<string, unknown>;

function trim(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function projectUnitForUrl(rawUrl: string): LeadProjectUnit {
  try {
    const url = new URL(rawUrl);
    return inferProjectUnit(url.hostname, url.pathname);
  } catch {
    return "unidentified";
  }
}

function attributionData(input: SiteTrackingAttribution) {
  return {
    source: trim(input.source, 160),
    medium: trim(input.medium, 160),
    campaign: trim(input.campaign, 300),
    content: trim(input.content, 300),
    term: trim(input.term, 300),
    gclid: trim(input.gclid, 300),
    fbclid: trim(input.fbclid, 300),
  };
}

function additionalDataForSiteLead(
  batch: SiteTrackingBatch,
  projectUnit: LeadProjectUnit,
) {
  const attribution = attributionData(batch.attribution);
  return {
    siteVisitorId: batch.visitorId,
    siteSessionId: batch.sessionId,
    siteLandingPage: trim(batch.landingPage, 1000),
    siteProjectUnit: projectUnit,
    siteUtmSource: attribution.source,
    siteUtmMedium: attribution.medium,
    siteUtmCampaign: attribution.campaign,
    siteUtmContent: attribution.content,
    siteUtmTerm: attribution.term,
    siteGclid: attribution.gclid,
    siteFbclid: attribution.fbclid,
  };
}

async function upsertSiteLead(batch: SiteTrackingBatch, projectUnit: LeadProjectUnit) {
  if (!batch.identity) return null;
  const identity = {
    name: trim(batch.identity.name, 300),
    email: trim(batch.identity.email, 320),
    phone: trim(batch.identity.phone, 80),
    company: trim(batch.identity.company, 300),
  };
  if (!identity.email && !identity.phone) return null;

  const normalizedEmail = normalizeEmail(identity.email);
  const normalizedPhone = normalizePhone(identity.phone);
  const formSubmit = [...batch.events].reverse().find((event) => event.name === "form_submit");
  const submissionId = formSubmit?.id ?? null;
  const attribution = attributionData(batch.attribution);
  const origin = inferSiteLeadOrigin(attribution);
  const additionalData = additionalDataForSiteLead(batch, projectUnit);
  const enteredAt = formSubmit?.occurredAt ?? new Date().toISOString();
  const name = identity.name || identity.company || identity.email || identity.phone;
  const sql = getSql();
  const rows = await sql`
    INSERT INTO leads (
      site_submission_id, name, company, email, phone, normalized_email,
      normalized_phone, normalized_company, origin, project_unit, entered_at,
      status, additional_data, source_type, source_label, updated_at
    ) VALUES (
      ${submissionId}, ${name}, ${identity.company}, ${identity.email}, ${identity.phone},
      ${normalizedEmail}, ${normalizedPhone}, ${normalizeCompany(identity.company)}, ${origin}, ${projectUnit}, ${enteredAt},
      'pending', ${JSON.stringify(additionalData)}::jsonb, 'site', 'Site da Global', NOW()
    )
    ON CONFLICT (site_submission_id) WHERE site_submission_id IS NOT NULL
    DO UPDATE SET
      name = COALESCE(NULLIF(EXCLUDED.name, ''), leads.name),
      company = COALESCE(NULLIF(EXCLUDED.company, ''), leads.company),
      email = COALESCE(NULLIF(EXCLUDED.email, ''), leads.email),
      phone = COALESCE(NULLIF(EXCLUDED.phone, ''), leads.phone),
      normalized_email = COALESCE(NULLIF(EXCLUDED.normalized_email, ''), leads.normalized_email),
      normalized_phone = COALESCE(NULLIF(EXCLUDED.normalized_phone, ''), leads.normalized_phone),
      origin = EXCLUDED.origin,
      project_unit = EXCLUDED.project_unit,
      additional_data = COALESCE(leads.additional_data, '{}'::jsonb) || EXCLUDED.additional_data,
      source_type = 'site', source_label = 'Site da Global', updated_at = NOW()
    RETURNING id
  ` as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

async function matchExistingLead(batch: SiteTrackingBatch) {
  if (!batch.identity) return null;
  const email = normalizeEmail(trim(batch.identity.email, 320));
  const phone = normalizePhone(trim(batch.identity.phone, 80));
  if (!email && !phone) return null;
  const sql = getSql();
  const rows = await sql`
    SELECT id
    FROM leads
    WHERE (${email} <> '' AND normalized_email = ${email})
       OR (${phone} <> '' AND normalized_phone = ${phone})
    ORDER BY updated_at DESC
    LIMIT 1
  ` as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

export async function storeSiteTrackingBatch(batch: SiteTrackingBatch) {
  const sql = getSql();
  const attribution = attributionData(batch.attribution);
  const landingPage = trim(batch.landingPage, 1000);
  const projectUnit = projectUnitForUrl(landingPage);
  const firstOccurredAt = batch.events[0]?.occurredAt ?? batch.sessionStartedAt;
  const lastEvent = batch.events.at(-1);
  const lastOccurredAt = lastEvent?.occurredAt ?? firstOccurredAt;
  const lastPage = trim(lastEvent?.pageUrl ?? landingPage, 1000);
  const attributionJson = JSON.stringify(attribution);

  await sql`
    INSERT INTO site_visitors (
      visitor_id, first_seen_at, last_seen_at, first_attribution,
      last_attribution, landing_page, last_page, project_unit
    ) VALUES (
      ${batch.visitorId}::uuid, ${firstOccurredAt}, ${lastOccurredAt},
      ${attributionJson}::jsonb, ${attributionJson}::jsonb,
      ${landingPage}, ${lastPage}, ${projectUnit}
    )
    ON CONFLICT (visitor_id) DO UPDATE SET
      last_seen_at = GREATEST(site_visitors.last_seen_at, EXCLUDED.last_seen_at),
      last_attribution = EXCLUDED.last_attribution,
      last_page = EXCLUDED.last_page,
      project_unit = CASE
        WHEN site_visitors.project_unit = 'unidentified' THEN EXCLUDED.project_unit
        ELSE site_visitors.project_unit
      END
  `;

  await sql`
    INSERT INTO site_sessions (
      session_id, visitor_id, started_at, last_seen_at, source, medium,
      campaign, content, term, gclid, fbclid, referrer, landing_page, project_unit
    ) VALUES (
      ${batch.sessionId}::uuid, ${batch.visitorId}::uuid, ${batch.sessionStartedAt},
      ${lastOccurredAt}, ${attribution.source}, ${attribution.medium},
      ${attribution.campaign}, ${attribution.content}, ${attribution.term},
      ${attribution.gclid}, ${attribution.fbclid},
      ${trim(batch.events[0]?.referrer, 1000)}, ${landingPage}, ${projectUnit}
    )
    ON CONFLICT (session_id) DO UPDATE SET
      last_seen_at = GREATEST(site_sessions.last_seen_at, EXCLUDED.last_seen_at)
  `;

  const existingLeadId = await matchExistingLead(batch);
  const createdLeadId = existingLeadId ?? await upsertSiteLead(batch, projectUnit);
  const leadId = existingLeadId ?? createdLeadId;

  const eventRows = batch.events.map((event) => ({
    event_id: event.id,
    visitor_id: batch.visitorId,
    session_id: batch.sessionId,
    lead_id: leadId,
    event_name: event.name,
    occurred_at: event.occurredAt,
    page_url: trim(event.pageUrl, 1000),
    page_title: trim(event.pageTitle, 300),
    referrer: trim(event.referrer, 1000),
    event_data: event.data ?? {},
  }));

  await sql`
    WITH incoming AS (
      SELECT *
      FROM jsonb_to_recordset(${JSON.stringify(eventRows)}::jsonb) AS item(
        event_id text, visitor_id text, session_id text, lead_id text,
        event_name text, occurred_at timestamptz, page_url text,
        page_title text, referrer text, event_data jsonb
      )
    )
    INSERT INTO site_tracking_events (
      event_id, visitor_id, session_id, lead_id, event_name, occurred_at,
      page_url, page_title, referrer, event_data
    )
    SELECT
      event_id::uuid, visitor_id::uuid, session_id::uuid, lead_id::uuid,
      event_name, occurred_at, page_url, page_title, referrer, event_data
    FROM incoming
    ON CONFLICT (event_id) DO NOTHING
  `;

  if (leadId) {
    await sql`
      UPDATE site_tracking_events
      SET lead_id = ${leadId}::uuid
      WHERE visitor_id = ${batch.visitorId}::uuid AND lead_id IS NULL
    `;
    await sql`
      UPDATE leads
      SET
        origin = CASE
          WHEN ${inferSiteLeadOrigin(attribution)} = 'Não identificado' THEN origin
          ELSE ${inferSiteLeadOrigin(attribution)}
        END,
        project_unit = CASE
          WHEN project_unit = 'unidentified' THEN ${projectUnit}
          ELSE project_unit
        END,
        additional_data = COALESCE(additional_data, '{}'::jsonb) || ${JSON.stringify(additionalDataForSiteLead(batch, projectUnit))}::jsonb,
        updated_at = NOW()
      WHERE id = ${leadId}::uuid
    `;
  }

  return { stored: eventRows.length, leadId, projectUnit };
}

export async function getSiteJourneyForLead(leadId: string): Promise<SiteJourney | null> {
  const sql = getSql();
  const eventRows = await sql`
    SELECT
      e.event_id AS id,
      e.event_name AS name,
      e.occurred_at,
      e.page_url,
      e.page_title,
      e.event_data,
      e.session_id,
      s.source,
      s.medium,
      s.campaign,
      s.content,
      s.term,
      s.landing_page,
      s.project_unit
    FROM site_tracking_events e
    JOIN site_sessions s ON s.session_id = e.session_id
    WHERE e.lead_id = ${leadId}::uuid
    ORDER BY e.occurred_at ASC
  ` as DatabaseRow[];
  if (!eventRows.length) return null;

  const scored = scoreSiteJourney(eventRows.map((row) => ({
    name: String(row.name) as SiteEventName,
    sessionId: String(row.session_id),
  })));
  const last = eventRows.at(-1) as DatabaseRow;
  const first = eventRows[0];
  const events: SiteJourneyEvent[] = eventRows.map((row) => ({
    id: String(row.id),
    name: String(row.name) as SiteEventName,
    occurredAt: new Date(String(row.occurred_at)).toISOString(),
    pageUrl: String(row.page_url ?? ""),
    pageTitle: String(row.page_title ?? ""),
    data: Object.fromEntries(
      Object.entries((row.event_data as Record<string, unknown>) ?? {}).map(([key, value]) => [key, String(value ?? "")]),
    ),
  }));

  return {
    ...scored,
    firstSeenAt: new Date(String(first.occurred_at)).toISOString(),
    lastSeenAt: new Date(String(last.occurred_at)).toISOString(),
    source: String(last.source ?? ""),
    medium: String(last.medium ?? ""),
    campaign: String(last.campaign ?? ""),
    content: String(last.content ?? ""),
    term: String(last.term ?? ""),
    landingPage: String(first.landing_page ?? ""),
    projectUnit: String(last.project_unit ?? "unidentified") as LeadProjectUnit,
    events,
  };
}
