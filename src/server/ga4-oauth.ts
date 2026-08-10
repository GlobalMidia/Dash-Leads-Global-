import "server-only";

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getSql } from "@/server/db";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALLBACK_PATH = "/api/ga4/callback";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

type GoogleTokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number };
export type Ga4StoredTokens = { accessToken: string | null; refreshToken: string; expiresAt: Date | null };

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Configure ${name} na Vercel antes de conectar o Google Analytics.`);
  return value;
}

function encryptionKey() {
  const key = Buffer.from(required("RD_TOKEN_ENCRYPTION_KEY"), "base64url");
  if (key.length !== 32) throw new Error("RD_TOKEN_ENCRYPTION_KEY inválida.");
  return key;
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decrypt(value: string) {
  const [version, ivValue, tagValue, encryptedValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) throw new Error("Token do GA4 armazenado em formato inválido.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}

export function isGa4OAuthConfigured() {
  return Boolean(process.env.GA4_CLIENT_ID?.trim() && process.env.GA4_CLIENT_SECRET?.trim());
}

export function callbackUrl(origin: string) {
  return new URL(CALLBACK_PATH, origin).toString();
}

export function createState() {
  const nonce = randomBytes(24).toString("base64url");
  const signature = createHmac("sha256", required("RD_OAUTH_STATE_SECRET")).update(nonce).digest("base64url");
  return `${nonce}.${signature}`;
}

export function isValidState(received: string | null, expected: string | undefined) {
  if (!received || !expected) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function authorizationUrl(origin: string, state: string) {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", required("GA4_CLIENT_ID"));
  url.searchParams.set("redirect_uri", callbackUrl(origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", state);
  return url;
}

export async function exchangeAuthorizationCode(code: string, origin: string) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: required("GA4_CLIENT_ID"),
      client_secret: required("GA4_CLIENT_SECRET"),
      redirect_uri: callbackUrl(origin),
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Google recusou a autorização do Analytics (${response.status}).`);
  const data = (await response.json()) as GoogleTokenResponse;
  if (!data.refresh_token) throw new Error("Google não retornou um refresh token. Tente novamente com consentimento.");
  return {
    accessToken: data.access_token ?? null,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? new Date(Date.now() + Math.max(data.expires_in - 120, 60) * 1000) : null,
  } satisfies Ga4StoredTokens;
}

export async function loadStoredGa4Tokens(): Promise<Ga4StoredTokens | null> {
  const rows = (await getSql()`SELECT encrypted_access_token, encrypted_refresh_token, access_token_expires_at FROM ga4_connections WHERE connection_identifier = 'corporate' LIMIT 1`) as Array<{ encrypted_access_token: string | null; encrypted_refresh_token: string | null; access_token_expires_at: Date | string | null }>;
  const row = rows[0];
  if (!row?.encrypted_refresh_token) return null;
  return {
    accessToken: row.encrypted_access_token ? decrypt(row.encrypted_access_token) : null,
    refreshToken: decrypt(row.encrypted_refresh_token),
    expiresAt: row.access_token_expires_at ? new Date(row.access_token_expires_at) : null,
  };
}

export async function storeGa4Tokens(tokens: Ga4StoredTokens, email: string | null) {
  await getSql()`
    INSERT INTO ga4_connections (connection_identifier, encrypted_access_token, encrypted_refresh_token, access_token_expires_at, connected_by_email, connected_at, updated_at)
    VALUES ('corporate', ${tokens.accessToken ? encrypt(tokens.accessToken) : null}, ${encrypt(tokens.refreshToken)}, ${tokens.expiresAt}, ${email}, NOW(), NOW())
    ON CONFLICT (connection_identifier) DO UPDATE SET
      encrypted_access_token = EXCLUDED.encrypted_access_token,
      encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
      access_token_expires_at = EXCLUDED.access_token_expires_at,
      connected_by_email = EXCLUDED.connected_by_email,
      connected_at = NOW(), updated_at = NOW()
  `;
}

export async function isGa4Connected() {
  try { return Boolean(await loadStoredGa4Tokens()); } catch { return false; }
}
