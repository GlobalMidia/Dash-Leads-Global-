import "server-only";

import type { GoogleAdsAccount, GoogleAdsCampaign, GoogleAdsDashboardData, GoogleAdsPeriod } from "@/types/google-ads";

const GOOGLE_ADS_BASE = "https://googleads.googleapis.com";

function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável ${name} não configurada na Vercel.`);
  return value;
}

function numeric(value: unknown) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function customerId(value: string) {
  return value.replaceAll("-", "").trim();
}

export function isGoogleAdsConfigured() {
  return ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN", "GOOGLE_ADS_CUSTOMER_ID"].every((key) => Boolean(process.env[key]?.trim()));
}

export function defaultGoogleAdsPeriod(): GoogleAdsPeriod {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 29);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

export function validGoogleAdsPeriod(input: Partial<GoogleAdsPeriod>): GoogleAdsPeriod {
  const fallback = defaultGoogleAdsPeriod();
  const startDate = input.startDate && /^\d{4}-\d{2}-\d{2}$/.test(input.startDate) ? input.startDate : fallback.startDate;
  const endDate = input.endDate && /^\d{4}-\d{2}-\d{2}$/.test(input.endDate) ? input.endDate : fallback.endDate;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end - start > 366 * 86400000) throw new Error("Selecione um período válido de até 366 dias.");
  return { startDate, endDate };
}

async function accessToken() {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_ADS_CLIENT_ID"),
      client_secret: env("GOOGLE_ADS_CLIENT_SECRET"),
      refresh_token: env("GOOGLE_ADS_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`OAuth do Google Ads recusou a renovação (${response.status}).`);
  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error("OAuth do Google Ads não retornou um access token.");
  return data.access_token;
}

async function googleRequest<T>(token: string, path: string, query?: string) {
  const version = process.env.GOOGLE_ADS_API_VERSION?.trim() || "v21";
  const headers = new Headers({
    Authorization: `Bearer ${token}`,
    "developer-token": env("GOOGLE_ADS_DEVELOPER_TOKEN"),
    "Content-Type": "application/json",
  });
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim();
  if (loginCustomerId) headers.set("login-customer-id", customerId(loginCustomerId));
  const response = await fetch(`${GOOGLE_ADS_BASE}/${version}/${path}`, { method: "POST", headers, body: JSON.stringify({ query }), cache: "no-store" });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google Ads respondeu ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }
  return response.json() as Promise<T>;
}

async function listAccessibleCustomers(token: string) {
  const version = process.env.GOOGLE_ADS_API_VERSION?.trim() || "v21";
  const headers = new Headers({ Authorization: `Bearer ${token}`, "developer-token": env("GOOGLE_ADS_DEVELOPER_TOKEN") });
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim();
  if (loginCustomerId) headers.set("login-customer-id", customerId(loginCustomerId));
  const response = await fetch(`${GOOGLE_ADS_BASE}/${version}/customers:listAccessibleCustomers`, { headers, cache: "no-store" });
  if (!response.ok) throw new Error(`Google Ads não listou as contas (${response.status}).`);
  const data = await response.json() as { resourceNames?: string[] };
  return (data.resourceNames ?? []).map((resource) => resource.split("/").pop()).filter(Boolean) as string[];
}

type SearchResponse = { results?: Array<Record<string, unknown>> };
function object(value: unknown) { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }

function readableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("OAuth") || message.includes("oauth")) return "A autorização do Google Ads expirou ou foi rejeitada. Atualize o refresh token na Vercel.";
  if (message.includes("403") || message.includes("PERMISSION_DENIED")) return "Sem permissão para consultar esta conta com o usuário/MCC configurado.";
  if (message.includes("400") || message.includes("INVALID_ARGUMENT")) return "Esta conta não pode ser consultada como anunciante (pode ser uma conta gerente/MCC).";
  return message.slice(0, 220);
}

async function accountReport(token: string, id: string, period: GoogleAdsPeriod): Promise<GoogleAdsAccount> {
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim();
  if (loginCustomerId && customerId(loginCustomerId) === id) {
    return { id, name: `MCC ${id}`, currency: "BRL", timeZone: "", manager: true, campaigns: [], spend: 0, impressions: 0, clicks: 0, conversions: 0, syncedAt: new Date().toISOString(), error: null };
  }
  const accountResult = await googleRequest<SearchResponse>(token, `customers/${id}/googleAds:search`, `SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer LIMIT 1`);
  const customer = object(accountResult.results?.[0]?.customer);
  const campaignResult = await googleRequest<SearchResponse>(token, `customers/${id}/googleAds:search`, `SELECT campaign.id, campaign.name, campaign.status, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.ctr, metrics.average_cpc FROM campaign WHERE segments.date BETWEEN '${period.startDate}' AND '${period.endDate}' ORDER BY metrics.cost_micros DESC`);
  const campaigns: GoogleAdsCampaign[] = (campaignResult.results ?? []).map((row) => {
    const campaign = object(row.campaign);
    const metrics = object(row.metrics);
    return { id: String(campaign.id ?? ""), name: String(campaign.name ?? "Campanha sem nome"), status: String(campaign.status ?? "UNKNOWN"), spend: numeric(metrics.costMicros) / 1_000_000, impressions: numeric(metrics.impressions), clicks: numeric(metrics.clicks), conversions: numeric(metrics.conversions), ctr: numeric(metrics.ctr) * 100, cpc: numeric(metrics.averageCpc) / 1_000_000 };
  });
  return { id, name: String(customer.descriptiveName ?? `Conta ${id}`), currency: String(customer.currencyCode ?? "BRL"), timeZone: String(customer.timeZone ?? ""), manager: Boolean(customer.manager), campaigns, spend: campaigns.reduce((sum, item) => sum + item.spend, 0), impressions: campaigns.reduce((sum, item) => sum + item.impressions, 0), clicks: campaigns.reduce((sum, item) => sum + item.clicks, 0), conversions: campaigns.reduce((sum, item) => sum + item.conversions, 0), syncedAt: new Date().toISOString(), error: null };
}

export async function getGoogleAdsDashboardData(input: Partial<GoogleAdsPeriod> = {}): Promise<GoogleAdsDashboardData> {
  const period = validGoogleAdsPeriod(input);
  if (!isGoogleAdsConfigured()) return { configured: false, accounts: [], period, lastUpdated: null, error: "As variáveis do Google Ads ainda não foram configuradas." };
  try {
    const token = await accessToken();
    const ids = await listAccessibleCustomers(token);
    const results = await Promise.all(ids.map(async (id) => {
      try { return await accountReport(token, id, period); } catch (error) { return { id, name: `Conta ${id}`, currency: "BRL", timeZone: "", manager: false, campaigns: [], spend: 0, impressions: 0, clicks: 0, conversions: 0, syncedAt: null, error: readableError(error) }; }
    }));
    return { configured: true, accounts: results.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), period, lastUpdated: new Date().toISOString(), error: null };
  } catch (error) {
    return { configured: true, accounts: [], period, lastUpdated: null, error: readableError(error) };
  }
}
