import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { getSql } from "@/server/db";

const RD_API_BASE = "https://api.rd.services";
const CALLBACK_PATH = "/api/rd/callback";

type RdTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

export type RdStoredTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
};

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Configure ${name} na Vercel antes de conectar o RD Station.`);
  return value;
}

function encryptionKey() {
  const key = Buffer.from(required("RD_TOKEN_ENCRYPTION_KEY"), "base64url");
  if (key.length !== 32) throw new Error("RD_TOKEN_ENCRYPTION_KEY invÃ¡lida.");
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
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Token do RD Station armazenado em formato invÃ¡lido.");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function callbackUrl(origin: string) {
  return new URL(CALLBACK_PATH, origin).toString();
}

export function createState() {
  const nonce = randomBytes(24).toString("base64url");
  const signature = createHmac("sha256", required("RD_OAUTH_STATE_SECRET"))
    .update(nonce)
    .digest("base64url");
  return `${nonce}.${signature}`;
}

export function isValidState(received: string | null, expected: string | undefined) {
  if (!received || !expected) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function authorizationUrl(origin: string, state: string) {
  const url = new URL(`${RD_API_BASE}/auth/dialog`);
  url.searchParams.set("client_id", required("RD_CLIENT_ID"));
  url.searchParams.set("redirect_uri", callbackUrl(origin));
  url.searchParams.set("state", state);
  return url;
}

export async function exchangeAuthorizationCode(code: string) {
  const response = await fetch(`${RD_API_BASE}/auth/token?token_by=code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: required("RD_CLIENT_ID"),
      client_secret: required("RD_CLIENT_SECRET"),
      code,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`RD Station recusou a autorizaÃ§Ã£o (${response.status}).`);
  const data = (await response.json()) as RdTokenResponse;
  if (!data.access_token || !data.refresh_token) {
    throw new Error("RD Station nÃ£o retornou os tokens de acesso esperados.");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + Math.max((data.expires_in ?? 86400) - 300, 60) * 1000),
  };
}

export async function loadStoredRdTokens(): Promise<RdStoredTokens | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT encrypted_access_token, encrypted_refresh_token, access_token_expires_at
    FROM rd_connections
    WHERE account_identifier = 'primary'
    LIMIT 1
  `) as Array<{
    encrypted_access_token: string | null;
    encrypted_refresh_token: string | null;
    access_token_expires_at: Date | string | null;
  }>;
  const row = rows[0];
  if (!row?.encrypted_access_token || !row.encrypted_refresh_token) return null;
  return {
    accessToken: decrypt(row.encrypted_access_token),
    refreshToken: decrypt(row.encrypted_refresh_token),
    expiresAt: row.access_token_expires_at ? new Date(row.access_token_expires_at) : null,
  };
}

export async function isRdConnected() {
  try {
    return Boolean(await loadStoredRdTokens());
  } catch {
    return false;
  }
}

export async function storeRdTokens(tokens: RdStoredTokens) {
  const sql = getSql();
  await sql`
    INSERT INTO rd_connections (
      account_identifier,
      encrypted_access_token,
      encrypted_refresh_token,
      access_token_expires_at,
      connected_at,
      updated_at
    ) VALUES (
      'primary',
      ${encrypt(tokens.accessToken)},
      ${encrypt(tokens.refreshToken)},
      ${tokens.expiresAt},
      NOW(),
      NOW()
    )
    ON CONFLICT (account_identifier) DO UPDATE SET
      encrypted_access_token = EXCLUDED.encrypted_access_token,
      encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
      access_token_expires_at = EXCLUDED.access_token_expires_at,
      connected_at = NOW(),
      updated_at = NOW()
  `;
}
