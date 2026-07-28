import { createHash } from "node:crypto";
import { normalizeLeadOrigin } from "@/lib/lead-origin";
import type { Lead } from "@/types/lead";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function stringValue(...values: unknown[]) {
  const value = values.find(
    (candidate) => typeof candidate === "string" && candidate.trim(),
  );
  return typeof value === "string" ? value.trim() : "";
}

function normalizedValue(value: unknown) {
  return typeof value === "string"
    ? value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR")
    : "";
}

function isInternalEmail(email: string) {
  return email.toLocaleLowerCase("pt-BR").endsWith("@globalmidia.digital");
}

function firstPhone(contact: UnknownRecord) {
  const mobile = contact.mobile_phone;
  const phone = contact.personal_phone;
  const phones = contact.phones;

  if (Array.isArray(phones)) {
    const normalized = phones
      .map((item) =>
        typeof item === "string"
          ? item
          : stringValue(asRecord(item).phone, asRecord(item).value),
      )
      .find(Boolean);
    if (normalized) return normalized;
  }

  return stringValue(
    mobile,
    phone,
    contact.business_phone,
    contact.phone,
    contact.whatsapp,
    contact.phone_number,
  );
}

function associatedContactData(contact: UnknownRecord, root: UnknownRecord) {
  const candidates: UnknownRecord[] = [];
  for (const key of [
    "person",
    "contact_person",
    "associated_contact",
    "owner",
  ]) {
    const value = asRecord(contact[key]);
    if (Object.keys(value).length) candidates.push(value);
  }
  for (const key of ["person", "contact_person", "associated_contact"]) {
    const value = asRecord(root[key]);
    if (Object.keys(value).length) candidates.push(value);
  }
  for (const key of ["contacts", "people", "associated_contacts"]) {
    if (!Array.isArray(contact[key])) continue;
    candidates.push(
      ...(contact[key] as unknown[]).map(asRecord).filter((item) => Object.keys(item).length),
    );
  }

  const person = candidates.find((item) =>
    stringValue(item.full_name, item.name, item.first_name, item.email),
  );
  if (!person) return {};
  const personName = stringValue(person.full_name, person.name, person.first_name);
  const personEmail = stringValue(person.email, person.email_address);
  const personPhone = firstPhone(person);
  return {
    ...(personName ? { rdContactName: personName } : {}),
    ...(personEmail ? { rdContactEmail: personEmail } : {}),
    ...(personPhone ? { rdContactPhone: personPhone } : {}),
  };
}

function safeIsoDate(value: unknown) {
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

function stableId(uuid: string, email: string) {
  return createHash("sha256").update(uuid || email).digest("hex").slice(0, 32);
}

export function normalizeRdContact(input: unknown): Lead | null {
  const root = asRecord(input);
  const contact = Object.keys(asRecord(root.contact)).length
    ? asRecord(root.contact)
    : root;
  const funnel = asRecord(contact.funnel);
  const firstConversion = asRecord(contact.first_conversion);
  const company = asRecord(contact.company);
  const organization = asRecord(contact.organization);
  const email = stringValue(contact.email, root.email);
  const rdUuid = stringValue(contact.uuid, contact.id, root.uuid, root.id);

  if (!email || !rdUuid || isInternalEmail(email)) return null;

  const enteredAt = safeIsoDate(
    contact.first_conversion_date ??
      firstConversion.created_at ??
      contact.created_at ??
      root.created_at ??
      contact.last_conversion_date ??
      root.event_timestamp,
  );

  const stage = stringValue(
    contact.lifecycle_stage,
    contact.funnel_stage,
    contact.stage,
    contact.status,
    contact.qualification,
    funnel.stage,
    funnel.stage_name,
    funnel.name,
  );
  const stageText = normalizedValue(stage);
  const status =
    root.event_type === "WEBHOOK.MARKED_OPPORTUNITY" ||
    ["qualified", "qualificado", "oportunidade", "opportunity", "mql", "sql"].some((term) =>
      stageText.includes(term),
    )
      ? "qualified"
      : ["closed", "fechado", "ganho", "won", "cliente", "customer"].some((term) =>
            stageText.includes(term),
          )
        ? "closed"
        : ["lost", "perdido", "desqualificado", "discarded"].some((term) =>
              stageText.includes(term),
            )
          ? "disqualified"
          : ["attended", "atendido", "contacted", "contatado"].some((term) =>
                stageText.includes(term),
              )
            ? "attended"
            : "pending";

  const rawOrigin = stringValue(
    funnel.origin,
    contact.traffic_source,
    contact.source,
    contact.utm_source,
    firstConversion.source,
    firstConversion.channel,
    root.event_identifier,
  );

  return {
    id: stableId(rdUuid, email),
    rdUuid,
    name: stringValue(contact.name, contact.first_name, email),
    company: stringValue(
      company.name,
      company.company_name,
      organization.name,
      organization.company_name,
      contact.company_name,
      contact.organization_name,
      root.company_name,
    ),
    email,
    phone: firstPhone(contact),
    origin: normalizeLeadOrigin(
      rawOrigin,
    ),
    enteredAt,
    status,
    notes: "",
    updatedAt: new Date().toISOString(),
    additionalData: {
      ...associatedContactData(contact, root),
      ...(stage ? { rdStage: stage } : {}),
      ...(rawOrigin ? { rdOrigin: rawOrigin } : {}),
      ...(contact.last_conversion_date
        ? { rdLastConversionAt: String(contact.last_conversion_date) }
        : {}),
    },
  };
}

export function extractRdContacts(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;

  const root = asRecord(payload);
  for (const key of ["contacts", "data", "leads"]) {
    if (Array.isArray(root[key])) return root[key] as unknown[];
  }

  return [payload];
}
