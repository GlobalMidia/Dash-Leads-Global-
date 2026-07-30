import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { getSql } from "@/server/db";

const META_GRAPH_BASE = "https://graph.facebook.com";
const META_OAUTH_BASE = "https://www.facebook.com";
const CALLBACK_PATH = "/api/meta/callback";
const CONNECTION_IDENTIFIER = "corporate";

type MetaTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

type MetaProfileResponse = { id?: string; name?: string };

type MetaAdAccount = {
  id?: string;
  account_id?: string;
  name?: string;
  currency?: string;
  account_status?: number;
};

type MetaAdAccountsResponse = {
  data?: MetaAdAccount[];
  paging?: { next?: string };
};

export type MetaConnectionStatus = {
  configured: boolean;
  managerConfigured: boolean;
  connected: boolean;
  accountName: string | null;
  accountCount: number;
  expiresAt: string | null;
  requiresReconnect: boolean;
};

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Configure ${name} na Vercel antes de conectar o Meta Ads.`);
  return value;
}

function version() {
  return process.env.META_GRAPH_API_VERSION || "v25.0";
}

function encryptionKey() {
  const key = Buffer.from(required("META_TOKEN_ENCRYPTION_KEY"), "base64url");
  if (key.length !== 32) throw new Error("META_TOKEN_ENCRYPTION_KEY inválida.");
  return key;
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function decrypt(value: string) {
  const [versionValue, ivValue, tagValue, encryptedValue] = value.split(".");
  if (versionValue !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Token do Meta Ads armazenado em formato inválido.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function callbackUrl(origin: string) {
  return process.env.META_OAUTH_REDIRECT_URI || new URL(CALLBACK_PATH, origin).toString();
}

export function isMetaOAuthConfigured() {
  return Boolean(
    process.env.META_APP_ID &&
      process.env.META_APP_SECRET &&
      process.env.META_OAUTH_STATE_SECRET &&
      process.env.META_TOKEN_ENCRYPTION_KEY,
  );
}

export function canManageMetaConnection(email: string) {
  const managers = (process.env.META_CONNECTION_MANAGER_EMAIL ?? "")
    .split(/[;,]/)
    .map((manager) => manager.trim().toLowerCase())
    .filter(Boolean);
  return managers.includes(email.trim().toLowerCase());
}

export function createState() {
  const nonce = randomBytes(24).toString("base64url");
  const signature = createHmac("sha256", required("META_OAUTH_STATE_SECRET"))
    .update(nonce)
    .digest("base64url");
  return `${nonce}.${signature}`;
}

export function isValidState(received: string | null, expected: string | undefined) {
  if (!received || !expected) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export function authorizationUrl(origin: string, state: string) {
  const url = new URL(`${META_OAUTH_BASE}/${version()}/dialog/oauth`);
  url.searchParams.set("client_id", required("META_APP_ID"));
  url.searchParams.set("redirect_uri", callbackUrl(origin));
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "ads_read");
  return url;
}

async function getJson<T>(url: URL | string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Meta Ads recusou a conexão (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ""}.`);
  }
  return (await response.json()) as T;
}

async function exchangeToken(url: URL) {
  const data = await getJson<MetaTokenResponse>(url);
  if (!data.access_token) throw new Error("Meta Ads não retornou um token de acesso.");
  return data;
}

export async function exchangeAuthorizationCode(code: string, origin: string) {
  const initialUrl = new URL(`${META_GRAPH_BASE}/${version()}/oauth/access_token`);
  initialUrl.searchParams.set("client_id", required("META_APP_ID"));
  initialUrl.searchParams.set("client_secret", required("META_APP_SECRET"));
  initialUrl.searchParams.set("redirect_uri", callbackUrl(origin));
  initialUrl.searchParams.set("code", code);
  const initial = await exchangeToken(initialUrl);

  const longLivedUrl = new URL(`${META_GRAPH_BASE}/${version()}/oauth/access_token`);
  longLivedUrl.searchParams.set("grant_type", "fb_exchange_token");
  longLivedUrl.searchParams.set("client_id", required("META_APP_ID"));
  longLivedUrl.searchParams.set("client_secret", required("META_APP_SECRET"));
  longLivedUrl.searchParams.set("fb_exchange_token", initial.access_token!);
  const longLived = await exchangeToken(longLivedUrl);
  if (!longLived.access_token) {
    throw new Error("Meta Ads não retornou o token de longa duração.");
  }
  return {
    accessToken: longLived.access_token,
    expiresAt: longLived.expires_in
      ? new Date(Date.now() + Math.max(longLived.expires_in - 60 * 60 * 24, 60) * 1000)
      : null,
  };
}

export async function loadMetaAdAccounts(accessToken: string) {
  const profileUrl = new URL(`${META_GRAPH_BASE}/${version()}/me`);
  profileUrl.searchParams.set("fields", "id,name");
  profileUrl.searchParams.set("access_token", accessToken);

  const accountsUrl = new URL(`${META_GRAPH_BASE}/${version()}/me/adaccounts`);
  accountsUrl.searchParams.set("fields", "id,account_id,name,currency,account_status");
  accountsUrl.searchParams.set("limit", "500");
  accountsUrl.searchParams.set("access_token", accessToken);

  const [profile, firstPage] = await Promise.all([
    getJson<MetaProfileResponse>(profileUrl),
    getJson<MetaAdAccountsResponse>(accountsUrl),
  ]);

  const accounts = [...(firstPage.data ?? [])];
  let next = firstPage.paging?.next;
  while (next) {
    const page = await getJson<MetaAdAccountsResponse>(next);
    accounts.push(...(page.data ?? []));
    next = page.paging?.next;
  }

  return {
    profile,
    accounts: accounts.map((account) => ({
      id: account.id ?? "",
      accountId: account.account_id ?? "",
      name: account.name ?? "Conta sem nome",
      currency: account.currency ?? "",
      status: account.account_status ?? null,
    })).filter((account) => account.id),
  };
}

export async function storeMetaConnection(input: {
  accessToken: string;
  expiresAt: Date | null;
  profile: MetaProfileResponse;
  accounts: Awaited<ReturnType<typeof loadMetaAdAccounts>>["accounts"];
  connectedByEmail: string;
}) {
  const sql = getSql();
  await sql`
    INSERT INTO meta_ads_connections (
      connection_identifier, encrypted_access_token, access_token_expires_at,
      meta_user_id, meta_user_name, ad_accounts, connected_by_email, connected_at, updated_at
    ) VALUES (
      ${CONNECTION_IDENTIFIER}, ${encrypt(input.accessToken)}, ${input.expiresAt},
      ${input.profile.id ?? null}, ${input.profile.name ?? null},
      ${JSON.stringify(input.accounts)}::jsonb, ${input.connectedByEmail}, NOW(), NOW()
    )
    ON CONFLICT (connection_identifier) DO UPDATE SET
      encrypted_access_token = EXCLUDED.encrypted_access_token,
      access_token_expires_at = EXCLUDED.access_token_expires_at,
      meta_user_id = EXCLUDED.meta_user_id,
      meta_user_name = EXCLUDED.meta_user_name,
      ad_accounts = EXCLUDED.ad_accounts,
      connected_by_email = EXCLUDED.connected_by_email,
      connected_at = NOW(),
      updated_at = NOW()
  `;
}

export async function getMetaConnectionStatus(): Promise<MetaConnectionStatus> {
  const base = {
    configured: isMetaOAuthConfigured(),
    managerConfigured: Boolean(process.env.META_CONNECTION_MANAGER_EMAIL),
  };
  if (!base.configured) {
    return { ...base, connected: false, accountName: null, accountCount: 0, expiresAt: null, requiresReconnect: false };
  }

  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT meta_user_name, ad_accounts, access_token_expires_at
      FROM meta_ads_connections
      WHERE connection_identifier = ${CONNECTION_IDENTIFIER}
      LIMIT 1
    `) as Array<{ meta_user_name: string | null; ad_accounts: unknown; access_token_expires_at: Date | string | null }>;
    const row = rows[0];
    if (!row) {
      return { ...base, connected: false, accountName: null, accountCount: 0, expiresAt: null, requiresReconnect: false };
    }
    const expiresAt = row.access_token_expires_at ? new Date(row.access_token_expires_at) : null;
    const accountCount = Array.isArray(row.ad_accounts) ? row.ad_accounts.length : 0;
    return {
      ...base,
      connected: true,
      accountName: row.meta_user_name,
      accountCount,
      expiresAt: expiresAt?.toISOString() ?? null,
      requiresReconnect: Boolean(expiresAt && expiresAt.getTime() <= Date.now() + 10 * 24 * 60 * 60 * 1000),
    };
  } catch {
    return { ...base, connected: false, accountName: null, accountCount: 0, expiresAt: null, requiresReconnect: false };
  }
}
