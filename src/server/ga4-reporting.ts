import "server-only";

import { getSql } from "@/server/db";
import { loadStoredGa4Tokens } from "@/server/ga4-oauth";
import type { Ga4Property } from "@/types/ga4";

type TokenResponse = { access_token?: string; expires_in?: number };
type AccountSummariesResponse = {
  accountSummaries?: Array<{
    account?: string;
    displayName?: string;
    propertySummaries?: Array<{ property?: string; displayName?: string }>;
  }>;
};

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Configure ${name} na Vercel.`);
  return value;
}

async function accessToken() {
  const stored = await loadStoredGa4Tokens();
  if (!stored) return null;
  if (stored.accessToken && stored.expiresAt && stored.expiresAt.getTime() > Date.now() + 60_000) return stored.accessToken;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: required("GA4_CLIENT_ID"), client_secret: required("GA4_CLIENT_SECRET"), refresh_token: stored.refreshToken, grant_type: "refresh_token" }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Google recusou a renovação do GA4 (${response.status}).`);
  const data = (await response.json()) as TokenResponse;
  if (!data.access_token) throw new Error("Google não retornou um token de acesso do GA4.");
  return data.access_token;
}

export async function getGa4Properties(): Promise<{ connected: boolean; properties: Ga4Property[]; error?: string }> {
  try {
    const token = await accessToken();
    if (!token) return { connected: false, properties: [] };
    const response = await fetch("https://analyticsadmin.googleapis.com/v1alpha/accountSummaries", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok) throw new Error(`Google Analytics respondeu ${response.status}.`);
    const data = (await response.json()) as AccountSummariesResponse;
    const properties = (data.accountSummaries ?? []).flatMap((account) => (account.propertySummaries ?? []).flatMap((property) => {
      const id = property.property?.replace(/^properties\//, "");
      const accountId = account.account?.replace(/^accounts\//, "");
      return id && accountId ? [{ id, name: property.displayName ?? id, accountId, accountName: account.displayName ?? accountId }] : [];
    }));
    return { connected: true, properties };
  } catch (error) {
    return { connected: true, properties: [], error: error instanceof Error ? error.message : "Não foi possível consultar as propriedades do GA4." };
  }
}
