import "server-only";

import { extractRdContacts, normalizeRdContact } from "@/lib/rd/normalize";
import { loadStoredRdTokens, storeRdTokens } from "@/server/rd-oauth";
import type { Lead } from "@/types/lead";

const RD_API_BASE = "https://api.rd.services";
const MAX_RD_CONTACTS_PER_SYNC = 500;

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

async function allContactsSegmentationId() {
  const result = await rdGet(`${RD_API_BASE}/platform/segmentations`);
  const segmentations = extractSegmentations(result.payload);
  const allContacts = segmentations.find((segmentation) => {
    const name = segmentation.name
      ?.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    return Boolean(
      segmentation.standard &&
        name?.includes("todos os contatos da base de leads"),
    );
  });

  if (!allContacts?.id) {
    throw new Error(
      "O RD Station não retornou a segmentação padrão ‘Todos os contatos da base de Leads’. Verifique se a conta possui acesso à base de Leads.",
    );
  }

  return String(allContacts.id);
}

export async function importAllRdContacts(): Promise<Lead[]> {
  const pageSize = 125;
  const segmentId = await allContactsSegmentationId();
  let page = 1;
  let totalRows = Number.POSITIVE_INFINITY;
  const leads = new Map<string, Lead>();

  while (
    (page - 1) * pageSize < totalRows &&
    page <= 20 &&
    leads.size < MAX_RD_CONTACTS_PER_SYNC
  ) {
    const url = new URL(
      `${RD_API_BASE}/platform/segmentations/${segmentId}/contacts`,
    );
    url.searchParams.set("page", String(page));
    url.searchParams.set("page_size", String(pageSize));
    url.searchParams.set("order", "last_conversion_date:desc");

    const result = await rdGet(url.toString());
    const contacts = extractRdContacts(result.payload);
    totalRows = result.totalRows || (page - 1) * pageSize + contacts.length;

    contacts.forEach((contact) => {
      if (leads.size >= MAX_RD_CONTACTS_PER_SYNC) return;
      const lead = normalizeRdContact(contact);
      if (lead?.rdUuid) leads.set(lead.rdUuid, lead);
    });

    if (
      contacts.length < pageSize ||
      leads.size >= MAX_RD_CONTACTS_PER_SYNC
    ) {
      break;
    }
    page += 1;
  }

  return [...leads.values()];
}
