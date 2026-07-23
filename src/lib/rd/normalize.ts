import { createHash } from "node:crypto";
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

  return stringValue(mobile, phone, contact.phone, contact.whatsapp);
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
  const email = stringValue(contact.email, root.email);
  const rdUuid = stringValue(contact.uuid, contact.id, root.uuid, root.id);

  if (!email || !rdUuid) return null;

  const enteredAt = safeIsoDate(
    contact.last_conversion_date ??
      contact.created_at ??
      root.event_timestamp ??
      root.created_at,
  );

  return {
    id: stableId(rdUuid, email),
    rdUuid,
    name: stringValue(contact.name, contact.first_name, email),
    email,
    phone: firstPhone(contact),
    origin: stringValue(
      funnel.origin,
      contact.traffic_source,
      contact.source,
      root.event_identifier,
      "RD Station",
    ),
    enteredAt,
    status:
      root.event_type === "WEBHOOK.MARKED_OPPORTUNITY"
        ? "qualified"
        : "pending",
    updatedAt: new Date().toISOString(),
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
