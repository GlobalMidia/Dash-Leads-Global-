import "server-only";

import { loadStoredGa4Tokens } from "@/server/ga4-oauth";
import type { Ga4Property, Ga4Report } from "@/types/ga4";

type TokenResponse = { access_token?: string; expires_in?: number };
type AccountSummariesResponse = {
  accountSummaries?: Array<{
    account?: string;
    displayName?: string;
    propertySummaries?: Array<{ property?: string; displayName?: string }>;
  }>;
};
type RunReportResponse = {
  rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>;
  totals?: Array<{ metricValues?: Array<{ value?: string }> }>;
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

function reportNumber(value: string | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getGa4Report(propertyId: string, startDate: string, endDate: string): Promise<Ga4Report> {
  if (!/^\d+$/.test(propertyId)) throw new Error("Propriedade do GA4 inválida.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) throw new Error("Período do GA4 inválido.");
  const token = await accessToken();
  if (!token) throw new Error("Conecte o Google Analytics antes de consultar relatórios.");
  const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const base = { dateRanges: [{ startDate, endDate }] };
  const run = async (dimensions: string[], metrics: string[], limit = "1000") => {
    const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...base, dimensions: dimensions.map((name) => ({ name })), metrics: metrics.map((name) => ({ name })), limit }), cache: "no-store" });
    if (!response.ok) throw new Error(`Google Analytics respondeu ${response.status} ao consultar a propriedade.`);
    return (await response.json()) as RunReportResponse;
  };
  const [overview, channels, dates] = await Promise.all([
    run([], ["activeUsers", "sessions", "conversions", "eventCount"], "1"),
    run(["sessionDefaultChannelGroup"], ["sessions", "conversions"], "100"),
    run(["date"], ["activeUsers", "sessions", "conversions"], "1000"),
  ]);
  const totalValues = overview.totals?.[0]?.metricValues ?? overview.rows?.[0]?.metricValues ?? [];
  return {
    propertyId,
    startDate,
    endDate,
    totals: { activeUsers: reportNumber(totalValues[0]?.value), sessions: reportNumber(totalValues[1]?.value), conversions: reportNumber(totalValues[2]?.value), eventCount: reportNumber(totalValues[3]?.value) },
    byChannel: (channels.rows ?? []).map((row) => ({ channel: row.dimensionValues?.[0]?.value || "(não definido)", sessions: reportNumber(row.metricValues?.[0]?.value), conversions: reportNumber(row.metricValues?.[1]?.value) })),
    byDate: (dates.rows ?? []).map((row) => ({ date: row.dimensionValues?.[0]?.value || "", activeUsers: reportNumber(row.metricValues?.[0]?.value), sessions: reportNumber(row.metricValues?.[1]?.value), conversions: reportNumber(row.metricValues?.[2]?.value) })),
  };
}
