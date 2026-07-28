import { createHash } from "node:crypto";
import { normalizeLeadOrigin } from "@/lib/lead-origin";
import type { Lead } from "@/types/lead";

type UnknownRecord = Record<string, unknown>;
const CRM_DATA_MAPPING_VERSION = "3";

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

function normalizedKey(value: string) {
  return normalizedValue(value)
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scalarValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map(scalarValue).find(Boolean) ?? "";
  }
  if (value && typeof value === "object") {
    const record = value as UnknownRecord;
    for (const key of ["value", "content", "answer", "text", "pt-BR", "pt_BR"]) {
      const resolved = scalarValue(record[key]);
      if (resolved) return resolved;
    }
  }
  return "";
}

/**
 * O RD devolve campos personalizados tanto no objeto principal quanto dentro
 * de custom_fields. Os identificadores sÃ£o configurÃ¡veis por conta, portanto
 * procuramos pelo rÃ³tulo/identificador normalizado em vez de depender de uma
 * Ãºnica chave fixa.
 */
function customFieldValue(input: unknown, aliases: string[]) {
  const aliasKeys = aliases.map(normalizedKey);
  const visited = new WeakSet<object>();

  const isMatch = (key: string) => {
    const normalized = normalizedKey(key);
    return aliasKeys.some(
      (alias) =>
        normalized === alias ||
        normalized === `cf ${alias}` ||
        normalized.startsWith(`cf ${alias} `) ||
        normalized.startsWith(`${alias} `),
    );
  };

  const visit = (value: unknown, depth: number): string => {
    if (depth > 5 || !value || typeof value !== "object") return "";
    if (visited.has(value)) return "";
    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item, depth + 1);
        if (found) return found;
      }
      return "";
    }

    const record = value as UnknownRecord;
    const fieldDefinitions = [
      record,
      asRecord(record.field),
      asRecord(record.definition),
      asRecord(record.custom_field),
    ];
    for (const field of fieldDefinitions) {
      const fieldIdentifier = scalarValue(
        field.api_identifier ?? field.identifier ?? field.field_name ?? field.name ?? field.label,
      );
      if (fieldIdentifier && isMatch(fieldIdentifier)) {
        const direct = scalarValue(
          record.value ?? record.field_value ?? record.content ?? record.answer ?? record.data ?? record.values,
        );
        if (direct) return direct;
      }
    }

    for (const [key, nested] of Object.entries(record)) {
      if (isMatch(key)) {
        const direct = scalarValue(nested);
        if (direct) return direct;
      }
    }
    for (const nested of Object.values(record)) {
      const found = visit(nested, depth + 1);
      if (found) return found;
    }
    return "";
  };

  return visit(input, 0);
}

function commercialCrmData(input: unknown) {
  const opportunityValue = customFieldValue(input, [
    "valor total da oportunidade no crm",
    "valor da oportunidade no crm",
    "valor total da oportunidade",
  ]);
  const salesStage = customFieldValue(input, [
    "etapa do funil de vendas no crm",
    "etapa do funil no crm",
  ]);
  const salesFunnel = customFieldValue(input, ["funil de vendas no crm"]);
  const opportunityQualification = customFieldValue(input, [
    "qualificacao da oportunidade no crm",
  ]);
  const opportunityOwner = customFieldValue(input, [
    "nome do responsavel pela oportunidade no crm",
    "responsavel pela oportunidade no crm",
  ]);

  return {
    ...(opportunityValue ? { rdOpportunityValue: opportunityValue } : {}),
    ...(salesStage ? { rdCrmSalesStage: salesStage } : {}),
    ...(salesFunnel ? { rdCrmSalesFunnel: salesFunnel } : {}),
    ...(opportunityQualification ? { rdCrmQualification: opportunityQualification } : {}),
    ...(opportunityOwner ? { rdCrmOwner: opportunityOwner } : {}),
  };
}

function booleanValue(...values: unknown[]) {
  return values.some((value) => value === true || value === 1 || value === "true");
}

function emailWarning(contact: UnknownRecord, root: UnknownRecord): Record<string, string> {
  const status = stringValue(
    contact.email_status,
    contact.email_validation_status,
    contact.email_deliverability,
    root.email_status,
  );
  const statusText = normalizedValue(status);
  const disabled =
    booleanValue(
      contact.email_invalid,
      contact.email_disabled,
      contact.email_bounced,
      contact.email_blocked,
      root.email_invalid,
      root.email_disabled,
    ) ||
    ["invalid", "invalido", "bounce", "bounced", "blocked", "blocked", "disabled", "desativado", "unsubscribed"].some(
      (term) => statusText.includes(term),
    );
  if (!disabled) return {};
  return {
    rdEmailWarning: status || "Este e-mail foi marcado como inválido ou desativado no RD Station.",
  };
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
  const crmData = commercialCrmData(input);

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
    crmData.rdCrmSalesStage,
  );
  const stageText = normalizedValue(stage);
  const status =
    root.event_type === "WEBHOOK.MARKED_OPPORTUNITY" ||
    ["qualified", "qualificado", "oportunidade", "opportunity", "mql", "sql", "negociacao", "negotiation"].some((term) =>
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
      ...(stringValue(root.__rdDetailsEnrichedAt)
        ? {
            rdDetailsEnrichedAt: stringValue(root.__rdDetailsEnrichedAt),
            rdCrmDataCheckedAt: stringValue(root.__rdDetailsEnrichedAt),
            rdCrmDataMappingVersion: CRM_DATA_MAPPING_VERSION,
          }
        : {}),
      ...associatedContactData(contact, root),
      ...emailWarning(contact, root),
      ...(stringValue(contact.website, root.website)
        ? { rdWebsite: stringValue(contact.website, root.website) }
        : {}),
      ...(stringValue(contact.linkedin, root.linkedin)
        ? { rdLinkedin: stringValue(contact.linkedin, root.linkedin) }
        : {}),
      ...(stringValue(contact.instagram, root.instagram)
        ? { rdInstagram: stringValue(contact.instagram, root.instagram) }
        : {}),
      ...(stringValue(contact.facebook, root.facebook)
        ? { rdFacebook: stringValue(contact.facebook, root.facebook) }
        : {}),
      ...(stage ? { rdStage: stage } : {}),
      ...(rawOrigin ? { rdOrigin: rawOrigin } : {}),
      ...(contact.last_conversion_date
        ? { rdLastConversionAt: String(contact.last_conversion_date) }
        : {}),
      ...crmData,
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
