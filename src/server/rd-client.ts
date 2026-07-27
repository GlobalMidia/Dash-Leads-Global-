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
};

type SyncCursor = {
  segmentation_id: string | null;
  next_page: number;
  imported_count: number;
  status: "idle" | "running" | "completed" | "failed";
};

/** Busca uma única página; o cursor persistido permite retomar sem timeout. */
export async function importNextRdBatch(): Promise<RdSyncBatch> {
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
    const byUuid = new Map<string, Lead>();
    sourceContacts.forEach((contact) => {
      const lead = normalizeRdContact(contact);
      if (lead?.rdUuid) byUuid.set(lead.rdUuid, lead);
    });
    const total = result.totalRows > 0 ? result.totalRows : null;
    const hasMore = total ? page * RD_BATCH_SIZE < total : sourceContacts.length === RD_BATCH_SIZE;
    const processed = alreadyImported + sourceContacts.length;

    await sql`
      INSERT INTO rd_sync_cursor (
        account_identifier, segmentation_id, next_page, total_rows,
        imported_count, status, last_error, started_at, updated_at, completed_at
      ) VALUES (
        'primary', ${segmentId}, ${hasMore ? page + 1 : page}, ${total},
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
    return { contacts: [...byUuid.values()], hasMore, page, processed, total };
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
