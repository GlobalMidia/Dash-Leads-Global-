import "server-only";

import { extractRdContacts, normalizeRdContact } from "@/lib/rd/normalize";
import type { Lead } from "@/types/lead";

const RD_API_BASE = "https://api.rd.services";
const SEGMENT_ALL_CONTACTS = "1";

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

export function isRdConfigured() {
  return Boolean(
    process.env.RD_ACCESS_TOKEN ||
      (process.env.RD_CLIENT_ID &&
        process.env.RD_CLIENT_SECRET &&
        process.env.RD_REFRESH_TOKEN),
  );
}

async function refreshAccessToken() {
  const clientId = process.env.RD_CLIENT_ID;
  const clientSecret = process.env.RD_CLIENT_SECRET;
  const refreshToken = process.env.RD_REFRESH_TOKEN;

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

  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + Math.max((data.expires_in ?? 86400) - 300, 60) * 1000,
  };
  return cachedToken.value;
}

async function accessToken() {
  if (process.env.RD_ACCESS_TOKEN) return process.env.RD_ACCESS_TOKEN;
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  return refreshAccessToken();
}

async function rdGet(url: string) {
  const token = await accessToken();
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Erro ${response.status} ao consultar o RD Station.`);
  }

  return {
    payload: (await response.json()) as unknown,
    totalRows: Number(response.headers.get("pagination-total-rows") ?? "0"),
  };
}

export async function importAllRdContacts(): Promise<Lead[]> {
  const pageSize = 125;
  let page = 1;
  let totalRows = Number.POSITIVE_INFINITY;
  const leads = new Map<string, Lead>();

  while ((page - 1) * pageSize < totalRows && page <= 200) {
    const url = new URL(
      `${RD_API_BASE}/platform/segmentations/${SEGMENT_ALL_CONTACTS}/contacts`,
    );
    url.searchParams.set("page", String(page));
    url.searchParams.set("page_size", String(pageSize));
    url.searchParams.set("order", "last_conversion_date:desc");

    const result = await rdGet(url.toString());
    const contacts = extractRdContacts(result.payload);
    totalRows = result.totalRows || (page - 1) * pageSize + contacts.length;

    contacts.forEach((contact) => {
      const lead = normalizeRdContact(contact);
      if (lead?.rdUuid) leads.set(lead.rdUuid, lead);
    });

    if (contacts.length < pageSize) break;
    page += 1;
  }

  return [...leads.values()];
}
