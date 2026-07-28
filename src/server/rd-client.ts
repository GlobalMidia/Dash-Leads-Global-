import "server-only";

import { extractRdContacts, normalizeRdContact } from "@/lib/rd/normalize";
import { loadStoredRdTokens, storeRdTokens } from "@/server/rd-oauth";
import { getSql } from "@/server/db";
import type { Lead } from "@/types/lead";

const RD_API_BASE = "https://api.rd.services";
// O RD aceita até 125 contatos por página. Uma chamada por segundo entrega
// até 7.500 contatos/minuto usando apenas 60 requisições/minuto.
const RD_BATCH_SIZE = 125;

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

type RdSegmentation = {
  id?: string | number;
  name?: string;
  standard?: boolean | null;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

export function isRdConfigured() {
  return Boolean(
    process.env.RD_ACCESS_TOKEN ||
      (process.env.RD_CLIENT_ID && process.env.RD_CLIENT_SECRET),
  );
}

async function refreshAccessToken(refreshToken: string, persist = false) {
  const clientId = process.env.RD_CLIENT_ID;
  const clientSecret = process.env.RD_CLIENT_SECRET;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Configure RD_ACCESS_TOKEN ou RD_CLIENT_ID, RD_CLIENT_SECRET e RD_REFRESH_TOKEN.",
    );
  }

  const response = await fetch(`${RD_API_BASE}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`RD Station recusou a renovação do token (${response.status}).`);
  }

  const data = (await response.json()) as TokenResponse;
  if (!data.access_token) {
    throw new Error("RD Station não retornou um access_token.");
  }

  const expiresAt = Date.now() + Math.max((data.expires_in ?? 86400) - 300, 60) * 1000;
  cachedToken = {
    value: data.access_token,
    expiresAt,
  };
  if (persist) {
    await storeRdTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: new Date(expiresAt),
    });
  }
  return cachedToken.value;
}

async function accessToken() {
  if (process.env.RD_ACCESS_TOKEN) return process.env.RD_ACCESS_TOKEN;
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const stored = await loadStoredRdTokens();
  if (stored) {
    if (stored.expiresAt && stored.expiresAt.getTime() > Date.now()) {
      cachedToken = { value: stored.accessToken, expiresAt: stored.expiresAt.getTime() };
      return cachedToken.value;
    }
    return refreshAccessToken(stored.refreshToken, true);
  }

  const refreshToken = process.env.RD_REFRESH_TOKEN;
  if (refreshToken) return refreshAccessToken(refreshToken);
  throw new Error("Conecte a conta do RD Station antes de sincronizar os leads.");
}

async function rdGet(url: string) {
  const token = await accessToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("O RD Station demorou mais de 20 segundos para responder. Tente novamente.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text();
    let detail = "";
    try {
      const parsed = JSON.parse(body) as { message?: string; error?: string };
      detail = parsed.message ?? parsed.error ?? "";
    } catch {
      detail = body.slice(0, 160);
    }
    throw new Error(
      `RD Station respondeu ${response.status}${detail ? `: ${detail}` : ""}.`,
    );
  }

  return {
    payload: (await response.json()) as unknown,
    totalRows: Number(response.headers.get("pagination-total-rows") ?? "0"),
  };
}

function rdCommercialFieldPaths(input: unknown) {
  const matches: string[] = [];
  const visited = new WeakSet<object>();
  const relevantKey = /(custom|cf_|crm|oportun|funil|respons|qualific|valor|stage|deal)/i;

  const visit = (value: unknown, path = "", depth = 0): void => {
    if (depth > 6 || !value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);

    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const nestedPath = path ? `${path}.${key}` : key;
      if (relevantKey.test(key) && matches.length < 40) matches.push(nestedPath);
      visit(nested, nestedPath, depth + 1);
    }
  };

  visit(input);
  return matches;
}

type RdWebhookSubscription = {
  uuid?: string;
  event_type?: string;
  url?: string;
};

function extractWebhookSubscriptions(payload: unknown): RdWebhookSubscription[] {
  if (Array.isArray(payload)) return payload as RdWebhookSubscription[];
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  for (const key of ["webhooks", "subscriptions", "items", "data"]) {
    if (Array.isArray(record[key])) return record[key] as RdWebhookSubscription[];
  }
  return [];
}

async function rdWebhookRequest(
  url: string,
  method: "GET" | "POST" | "PUT",
  body?: Record<string, unknown>,
) {
  const token = await accessToken();
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const responseText = await response.text();
  if (!response.ok) {
    let detail = responseText.slice(0, 180);
    try {
      const parsed = JSON.parse(responseText) as { message?: string; error?: string };
      detail = parsed.message ?? parsed.error ?? detail;
    } catch {
      // A resposta textual do RD já é a melhor informação disponível.
    }
    throw new Error(
      `RD Station não conseguiu configurar o recebimento automático (${response.status})${
        detail ? `: ${detail}` : ""
      }.`,
    );
  }

  if (!responseText) return null;
  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    return null;
  }
}

function conversionWebhookDestination(origin: string) {
  const secret = process.env.RD_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("A chave segura do webhook não está configurada na Vercel.");
  }

  const destination = new URL("/api/rd/webhook", origin);
  destination.searchParams.set("token", secret);
  return destination.toString();
}

/** Registra (ou atualiza) o webhook de conversões para manter novos leads em dia. */
export async function configureRdConversionWebhook(origin: string) {
  const destination = conversionWebhookDestination(origin);
  const subscription = {
    event_type: "WEBHOOK.CONVERTED",
    entity_type: "CONTACT",
    event_identifiers: [],
    url: destination,
    http_method: "POST",
    include_relations: ["COMPANY", "CONTACT_FUNNEL"],
  };

  const existingPayload = await rdWebhookRequest(
    `${RD_API_BASE}/integrations/webhooks`,
    "GET",
  );
  const existing = extractWebhookSubscriptions(existingPayload).find(
    (item) => item.event_type === subscription.event_type,
  );

  if (existing?.uuid) {
    if (existing.url === subscription.url) {
      return { active: true, changed: false };
    }
    await rdWebhookRequest(
      `${RD_API_BASE}/integrations/webhooks/${encodeURIComponent(existing.uuid)}`,
      "PUT",
      subscription,
    );
    return { active: true, changed: true };
  }

  try {
    await rdWebhookRequest(
      `${RD_API_BASE}/integrations/webhooks`,
      "POST",
      subscription,
    );
    return { active: true, changed: true };
  } catch (error) {
    // O RD pode ocultar assinaturas existentes da listagem da integração,
    // mas retorna 422 Duplicated URL quando esta inscrição já existe.
    if (error instanceof Error && error.message.includes("DUPLICATED_URL")) {
      return { active: true, changed: false };
    }
    throw error;
  }
}

function contactUuid(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const row = value as Record<string, unknown>;
  const nested = row.contact && typeof row.contact === "object"
    ? (row.contact as Record<string, unknown>)
    : {};
  return String(row.uuid ?? row.id ?? nested.uuid ?? nested.id ?? "");
}

function contactDetailUrl(value: unknown, uuid: string) {
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    const nested = row.contact && typeof row.contact === "object"
      ? (row.contact as Record<string, unknown>)
      : {};
    const links = Array.isArray(row.links)
      ? row.links
      : Array.isArray(nested.links)
        ? nested.links
        : [];
    const selfLink = links
      .map((item) => (item && typeof item === "object" ? item as Record<string, unknown> : {}))
      .find((item) => item.rel === "SELF" && typeof item.href === "string");
    if (typeof selfLink?.href === "string" && selfLink.href.includes("/platform/contacts/")) {
      return selfLink.href;
    }
  }
  return `${RD_API_BASE}/platform/contacts/${encodeURIComponent(uuid)}`;
}

function mergeContactDetails(summary: unknown, detailPayload: unknown) {
  const base = summary && typeof summary === "object"
    ? (summary as Record<string, unknown>)
    : {};
  const detail = detailPayload && typeof detailPayload === "object"
    ? (detailPayload as Record<string, unknown>)
    : {};
  const baseContact = base.contact && typeof base.contact === "object"
    ? (base.contact as Record<string, unknown>)
    : {};
  const detailContact = detail.contact && typeof detail.contact === "object"
    ? (detail.contact as Record<string, unknown>)
    : {};
  return {
    ...base,
    ...detail,
    contact: { ...baseContact, ...detailContact },
  };
}

const RD_DETAILS_PER_SYNC = 60;

async function enrichContacts(sourceContacts: unknown[], enrichedUuids: Set<string>) {
  // O endpoint de detalhes do RD só aceita um UUID por requisição. Bloquear a
  // paginação de 125 contatos para enriquecer toda a base aqui torna uma
  // sincronização histórica inviável. Os detalhes passam a ser carregados ao
  // abrir um perfil; a flag existe apenas para uma manutenção excepcional.
  if (process.env.RD_SYNC_ENRICH_ALL !== "true") {
    return {
      contacts: sourceContacts,
      remainingDetails: 0,
      completedDetails: sourceContacts.length,
    };
  }

  const pending = sourceContacts.filter((contact) => {
    const uuid = contactUuid(contact);
    return uuid && !enrichedUuids.has(uuid);
  }).slice(0, RD_DETAILS_PER_SYNC);
  const enriched = new Map<string, unknown>();

  // O RD limita a API a 120 requisições/minuto. Dois detalhes por segundo
  // mantém margem para a requisição da segmentação e evita novos 429.
  for (let index = 0; index < pending.length; index += 2) {
    const pair = pending.slice(index, index + 2);
    const results = await Promise.all(
      pair.map(async (summary) => {
        const uuid = contactUuid(summary);
        try {
          const detail = await rdGet(contactDetailUrl(summary, uuid));
          return [
            uuid,
            {
              ...mergeContactDetails(summary, detail.payload),
              __rdDetailsEnrichedAt: new Date().toISOString(),
            },
          ] as const;
        } catch (error) {
          console.warn("[rd-sync] não foi possível enriquecer contato", {
            uuid,
            error: error instanceof Error ? error.message : String(error),
          });
          return [uuid, summary] as const;
        }
      }),
    );
    results.forEach(([uuid, contact]) => enriched.set(uuid, contact));
    if (index + 2 < pending.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  const contacts = sourceContacts.map((summary) => {
    const uuid = contactUuid(summary);
    return enriched.get(uuid) ?? summary;
  });
  const newlyEnrichedUuids = new Set(
    contacts
      .filter((contact) => {
        if (!contact || typeof contact !== "object") return false;
        return Boolean((contact as Record<string, unknown>).__rdDetailsEnrichedAt);
      })
      .map(contactUuid),
  );
  const remainingDetails = sourceContacts.filter((contact) => {
    const uuid = contactUuid(contact);
    return uuid && !enrichedUuids.has(uuid) && !newlyEnrichedUuids.has(uuid);
  }).length;
  return {
    contacts,
    remainingDetails,
    completedDetails: sourceContacts.length - remainingDetails,
  };
}

export async function loadRdContactDetails(rdUuid: string): Promise<Lead | null> {
  const result = await rdGet(
    `${RD_API_BASE}/platform/contacts/${encodeURIComponent(rdUuid)}`,
  );
  if (!result.payload || typeof result.payload !== "object") return null;
  // Apenas a estrutura Ã© registrada para depuraÃ§Ã£o: nÃ£o inclui valores,
  // e-mails, telefones ou qualquer credencial do contato.
  console.info("[rd-details] esquema comercial recebido", {
    rdUuid,
    topLevelKeys: Object.keys(result.payload as Record<string, unknown>).slice(0, 80),
    commercialFieldPaths: rdCommercialFieldPaths(result.payload),
  });
  return normalizeRdContact({
    ...(result.payload as Record<string, unknown>),
    __rdDetailsEnrichedAt: new Date().toISOString(),
  });
}

function extractSegmentations(payload: unknown): RdSegmentation[] {
  if (Array.isArray(payload)) return payload as RdSegmentation[];
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  for (const key of ["segmentations", "contacts", "items", "data"]) {
    if (Array.isArray(record[key])) return record[key] as RdSegmentation[];
  }
  return [];
}

async function leadsFunnelSegmentationId() {
  const result = await rdGet(`${RD_API_BASE}/platform/segmentations`);
  const segmentations = extractSegmentations(result.payload);
  const leadsFunnel = segmentations.find((segmentation) => {
    const name = segmentation.name
      ?.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    return Boolean(
      segmentation.standard &&
        name?.includes("leads (estagio no funil)"),
    );
  });

  if (!leadsFunnel?.id) {
    throw new Error(
      "O RD Station não retornou a segmentação padrão ‘Leads (estágio no funil)’ para esta conta.",
    );
  }

  return String(leadsFunnel.id);
}

export type RdSyncBatch = {
  contacts: Lead[];
  hasMore: boolean;
  page: number;
  processed: number;
  total: number | null;
  detailsCompleted: number;
  detailsTotal: number;
};

type SyncCursor = {
  segmentation_id: string | null;
  next_page: number;
  imported_count: number;
  status: "idle" | "running" | "completed" | "failed";
};

/** Busca uma única página; o cursor persistido permite retomar sem timeout. */
export async function importNextRdBatch(): Promise<RdSyncBatch> {
  const startedAt = Date.now();
  const sql = getSql();
  const cursorRows = (await sql`
    SELECT segmentation_id, next_page, imported_count, status
    FROM rd_sync_cursor
    WHERE account_identifier = 'primary'
  `) as SyncCursor[];
  const cursor = cursorRows[0];
  const restarting = !cursor || cursor.status === "completed";
  const segmentId = restarting
    ? await leadsFunnelSegmentationId()
    : cursor.segmentation_id ?? (await leadsFunnelSegmentationId());
  const page = restarting ? 1 : Math.max(cursor.next_page, 1);
  const alreadyImported = restarting ? 0 : cursor.imported_count;
  const url = new URL(`${RD_API_BASE}/platform/segmentations/${segmentId}/contacts`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(RD_BATCH_SIZE));
  url.searchParams.set("order", "last_conversion_date:desc");

  try {
    const result = await rdGet(url.toString());
    const sourceContacts = extractRdContacts(result.payload);
    const sourceUuids = sourceContacts.map(contactUuid).filter(Boolean);
    const enrichedRows = sourceUuids.length
      ? ((await sql`
          SELECT rd_uuid
          FROM leads
          WHERE rd_uuid = ANY(${sourceUuids}::text[])
            AND additional_data ? 'rdDetailsEnrichedAt'
        `) as Array<{ rd_uuid: string }> )
      : [];
    const enrichedUuids = new Set(enrichedRows.map((row) => String(row.rd_uuid)));
    const detailResult = await enrichContacts(sourceContacts, enrichedUuids);
    const detailedContacts = detailResult.contacts;
    const byUuid = new Map<string, Lead>();
    detailedContacts.forEach((contact) => {
      const lead = normalizeRdContact(contact);
      if (lead?.rdUuid) byUuid.set(lead.rdUuid, lead);
    });
    const total = result.totalRows > 0 ? result.totalRows : null;
    const hasNextPage = total ? page * RD_BATCH_SIZE < total : sourceContacts.length === RD_BATCH_SIZE;
    const hasPendingDetails = detailResult.remainingDetails > 0;
    const hasMore = hasPendingDetails || hasNextPage;
    const processed = alreadyImported + (hasPendingDetails ? 0 : sourceContacts.length);

    await sql`
      INSERT INTO rd_sync_cursor (
        account_identifier, segmentation_id, next_page, total_rows,
        imported_count, status, last_error, started_at, updated_at, completed_at
      ) VALUES (
        'primary', ${segmentId}, ${hasPendingDetails ? page : hasNextPage ? page + 1 : page}, ${total},
        ${processed}, ${hasMore ? "running" : "completed"}, NULL, NOW(), NOW(),
        ${hasMore ? null : new Date().toISOString()}::timestamptz
      )
      ON CONFLICT (account_identifier) DO UPDATE SET
        segmentation_id = EXCLUDED.segmentation_id,
        next_page = EXCLUDED.next_page,
        total_rows = EXCLUDED.total_rows,
        imported_count = EXCLUDED.imported_count,
        status = EXCLUDED.status,
        last_error = NULL,
        started_at = CASE WHEN rd_sync_cursor.status = 'completed' THEN NOW() ELSE rd_sync_cursor.started_at END,
        updated_at = NOW(),
        completed_at = EXCLUDED.completed_at
    `;
    const batch = {
      contacts: [...byUuid.values()],
      hasMore,
      page,
      processed,
      total,
      detailsCompleted: detailResult.completedDetails,
      detailsTotal: sourceContacts.length,
    };
    console.info("[rd-sync] página importada", {
      page,
      received: sourceContacts.length,
      valid: batch.contacts.length,
      processed,
      total,
      hasMore,
      durationMs: Date.now() - startedAt,
    });
    return batch;
  } catch (error) {
    await sql`
      INSERT INTO rd_sync_cursor (
        account_identifier, segmentation_id, next_page, imported_count,
        status, last_error, updated_at
      ) VALUES (
        'primary', ${segmentId}, ${page}, ${alreadyImported}, 'failed',
        ${error instanceof Error ? error.message : "Falha ao consultar o RD Station."}, NOW()
      )
      ON CONFLICT (account_identifier) DO UPDATE SET
        status = 'failed', last_error = EXCLUDED.last_error, updated_at = NOW()
    `;
    throw error;
  }
}
