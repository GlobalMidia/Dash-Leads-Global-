import "server-only";

import { getSql } from "@/server/db";
import { getMetaConnectionForReporting, type StoredMetaAdAccount } from "@/server/meta-oauth";
import type { MetaAdsAccount, MetaAdsCampaign, MetaAdsDashboardData, MetaAdsPeriod } from "@/types/meta-ads";

const META_GRAPH_BASE = "https://graph.facebook.com";

type SnapshotRow = {
  account_id: string; account_name: string; account_number: string; currency: string; account_status: number | null; selected: boolean; archived: boolean; archived_at: Date | string | null;
  spend: string | number | null; impressions: string | number | null; clicks: string | number | null; reach: string | number | null;
  leads: string | number | null; campaign_count: string | number | null; campaigns: unknown; synced_at: Date | string | null; sync_error: string | null;
};
type MetaInsight = { campaign_id?: string; campaign_name?: string; spend?: string; impressions?: string; clicks?: string; reach?: string; ctr?: string; cpc?: string; actions?: Array<{ action_type?: string; value?: string }> };
type MetaResponse<T> = { data?: T[]; paging?: { next?: string } };

export function defaultMetaAdsPeriod(): MetaAdsPeriod {
  const end = new Date(); const start = new Date(end); start.setDate(end.getDate() - 29);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

export function validMetaAdsPeriod(input: Partial<MetaAdsPeriod>): MetaAdsPeriod {
  const fallback = defaultMetaAdsPeriod();
  const startDate = input.startDate && /^\d{4}-\d{2}-\d{2}$/.test(input.startDate) ? input.startDate : fallback.startDate;
  const endDate = input.endDate && /^\d{4}-\d{2}-\d{2}$/.test(input.endDate) ? input.endDate : fallback.endDate;
  const start = Date.parse(`${startDate}T00:00:00.000Z`); const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end - start > 366 * 86400000) throw new Error("Selecione um período válido de até 366 dias.");
  return { startDate, endDate };
}

function apiVersion() { return process.env.META_GRAPH_API_VERSION || "v25.0"; }
function numeric(value: string | number | null | undefined) { const result = Number(value ?? 0); return Number.isFinite(result) ? result : 0; }
function leadCount(actions: MetaInsight["actions"]) { return (actions ?? []).reduce((total, action) => total + (action.action_type?.toLowerCase().includes("lead") ? numeric(action.value) : 0), 0); }

function campaigns(value: unknown): MetaAdsCampaign[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string") return [];
    return [{ id: row.id, name: typeof row.name === "string" ? row.name : "Campanha sem nome", status: typeof row.status === "string" ? row.status : "UNKNOWN", objective: typeof row.objective === "string" ? row.objective : "", spend: numeric(row.spend as string | number), impressions: numeric(row.impressions as string | number), clicks: numeric(row.clicks as string | number), reach: numeric(row.reach as string | number), leads: numeric(row.leads as string | number), ctr: numeric(row.ctr as string | number), cpc: numeric(row.cpc as string | number) }];
  });
}

function account(row: SnapshotRow): MetaAdsAccount {
  return { id: row.account_id, accountId: row.account_number, name: row.account_name || "Conta sem nome", currency: row.currency, status: row.account_status, selected: row.selected, archived: row.archived, archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null, spend: numeric(row.spend), impressions: numeric(row.impressions), clicks: numeric(row.clicks), reach: numeric(row.reach), leads: numeric(row.leads), campaignCount: numeric(row.campaign_count), campaigns: campaigns(row.campaigns), syncedAt: row.synced_at ? new Date(row.synced_at).toISOString() : null, syncError: row.sync_error };
}

async function rows(period: MetaAdsPeriod) {
  const sql = getSql();
  return (await sql`
    SELECT selection.account_id, selection.account_name, selection.account_number, selection.currency, selection.account_status, selection.selected, selection.archived, selection.archived_at,
      snapshot.spend, snapshot.impressions, snapshot.clicks, snapshot.reach, snapshot.leads, snapshot.campaign_count, snapshot.campaigns, snapshot.synced_at, snapshot.sync_error
    FROM meta_ads_account_selections selection
    LEFT JOIN LATERAL (
      SELECT spend, impressions, clicks, reach, leads, campaign_count, campaigns, synced_at, sync_error
      FROM meta_ads_account_snapshots
      WHERE account_id = selection.account_id AND period_start = ${period.startDate}::date AND period_end = ${period.endDate}::date
      ORDER BY synced_at DESC LIMIT 1
    ) snapshot ON true
    ORDER BY selection.account_name ASC
  `) as SnapshotRow[];
}

export async function getMetaAdsDashboardData(input: Partial<MetaAdsPeriod> = {}): Promise<MetaAdsDashboardData> {
  const period = validMetaAdsPeriod(input); const connection = await getMetaConnectionForReporting();
  if (!connection) return { connected: false, accountName: null, accounts: [], selectedCount: 0, lastSyncAt: null, period };
  const existing = new Map((await rows(period)).map((row) => [row.account_id, row]));
  const all = connection.accounts.map((stored) => account(existing.get(stored.id) ?? { account_id: stored.id, account_name: stored.name, account_number: stored.accountId, currency: stored.currency, account_status: stored.status, selected: true, archived: false, archived_at: null, spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, campaign_count: 0, campaigns: [], synced_at: null, sync_error: null })).sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  const latest = all.reduce((result, item) => Math.max(result, item.syncedAt ? Date.parse(item.syncedAt) : 0), 0);
  return { connected: true, accountName: null, accounts: all, selectedCount: all.length, lastSyncAt: latest ? new Date(latest).toISOString() : null, period };
}

export async function saveMetaAdsSelections(accountIds: string[], actorEmail: string) {
  const connection = await getMetaConnectionForReporting(); if (!connection) throw new Error("Conecte a conta corporativa da Meta antes de continuar.");
  const selected = new Set(accountIds); const available = new Set(connection.accounts.map((item) => item.id));
  if ([...selected].some((id) => !available.has(id))) throw new Error("Uma das contas não pertence à conexão corporativa atual.");
  const sql = getSql();
  await Promise.all(connection.accounts.map((item) => sql`
    INSERT INTO meta_ads_account_selections (account_id, account_name, account_number, currency, account_status, selected, selected_by_email, selected_at, updated_at)
    VALUES (${item.id}, ${item.name}, ${item.accountId}, ${item.currency}, ${item.status}, ${selected.has(item.id)}, ${actorEmail}, ${selected.has(item.id) ? new Date() : null}, NOW())
    ON CONFLICT (account_id) DO UPDATE SET account_name = EXCLUDED.account_name, account_number = EXCLUDED.account_number, currency = EXCLUDED.currency, account_status = EXCLUDED.account_status, selected = EXCLUDED.selected, selected_by_email = EXCLUDED.selected_by_email, selected_at = CASE WHEN EXCLUDED.selected THEN NOW() ELSE NULL END, updated_at = NOW()
  `));
  return getMetaAdsDashboardData();
}

export async function setMetaAdsAccountArchived(accountId: string, archived: boolean, actorEmail: string, input: Partial<MetaAdsPeriod> = {}) {
  const period = validMetaAdsPeriod(input);
  const connection = await getMetaConnectionForReporting();
  if (!connection || !connection.accounts.some((item) => item.id === accountId)) {
    throw new Error("A conta informada não pertence à conexão corporativa atual.");
  }

  await saveMetaAdsSelections(connection.accounts.map((item) => item.id), actorEmail);
  const sql = getSql();
  await sql`
    UPDATE meta_ads_account_selections
    SET archived = ${archived}, archived_at = ${archived ? new Date() : null}, archived_by_email = ${archived ? actorEmail : null}, updated_at = NOW()
    WHERE account_id = ${accountId}
  `;
  return getMetaAdsDashboardData(period);
}

async function metaJson<T>(url: URL) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) { const detail = await response.text(); throw new Error(`Meta Ads recusou a sincronização (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ""}`); }
  return (await response.json()) as T;
}

async function allInsightPages(url: URL) {
  const items: MetaInsight[] = [];
  let nextUrl: URL | null = url;

  while (nextUrl) {
    const page: MetaResponse<MetaInsight> = await metaJson<MetaResponse<MetaInsight>>(nextUrl);
    items.push(...(page.data ?? []));
    nextUrl = page.paging?.next ? new URL(page.paging.next) : null;
  }

  return items;
}

async function syncOne(account: StoredMetaAdAccount, accessToken: string, period: MetaAdsPeriod) {
  const root = `${META_GRAPH_BASE}/${apiVersion()}/${encodeURIComponent(account.id)}`;
  const url = new URL(`${root}/insights`);
  url.searchParams.set("fields", "campaign_id,campaign_name,spend,impressions,clicks,reach,actions,ctr,cpc");
  url.searchParams.set("time_range", JSON.stringify({ since: period.startDate, until: period.endDate }));
  url.searchParams.set("level", "campaign"); url.searchParams.set("limit", "500"); url.searchParams.set("access_token", accessToken);
  const insightData = await allInsightPages(url);
  const campaignData: MetaAdsCampaign[] = insightData.flatMap((item) => {
    if (!item.campaign_id) return [];
    return [{ id: item.campaign_id, name: item.campaign_name || "Campanha sem nome", status: "UNKNOWN", objective: "", spend: numeric(item.spend), impressions: numeric(item.impressions), clicks: numeric(item.clicks), reach: numeric(item.reach), leads: leadCount(item.actions), ctr: numeric(item.ctr), cpc: numeric(item.cpc) }];
  }).sort((a, b) => b.spend - a.spend);
  const total = campaignData.reduce((sum, item) => ({ spend: sum.spend + item.spend, impressions: sum.impressions + item.impressions, clicks: sum.clicks + item.clicks, reach: sum.reach + item.reach, leads: sum.leads + item.leads }), { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0 });
  return { ...total, campaigns: campaignData };
}

export async function syncMetaAdsAccounts(input: Partial<MetaAdsPeriod> = {}) {
  const period = validMetaAdsPeriod(input); const connection = await getMetaConnectionForReporting();
  if (!connection) throw new Error("A conta corporativa do Meta Ads não está conectada.");
  console.info("[meta-ads/sync] started", { accounts: connection.accounts.length, period });
  await saveMetaAdsSelections(connection.accounts.map((item) => item.id), "sistema");
  const sql = getSql(); let synced = 0; const failed: string[] = [];
  const queue = [...connection.accounts];
  const runWorker = async () => {
    let item = queue.shift();
    while (item) {
    try {
      const result = await syncOne(item, connection.accessToken, period);
      await sql`
        INSERT INTO meta_ads_account_snapshots (account_id, period_start, period_end, spend, impressions, clicks, reach, leads, campaign_count, campaigns, sync_error, synced_at)
        VALUES (${item.id}, ${period.startDate}, ${period.endDate}, ${result.spend}, ${result.impressions}, ${result.clicks}, ${result.reach}, ${result.leads}, ${result.campaigns.length}, ${JSON.stringify(result.campaigns)}::jsonb, NULL, NOW())
        ON CONFLICT (account_id, period_start, period_end) DO UPDATE SET spend = EXCLUDED.spend, impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks, reach = EXCLUDED.reach, leads = EXCLUDED.leads, campaign_count = EXCLUDED.campaign_count, campaigns = EXCLUDED.campaigns, sync_error = NULL, synced_at = NOW()
      `; synced += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 900) : "Falha desconhecida ao consultar a conta."; failed.push(item.name);
      console.warn("[meta-ads/sync] account failed", { accountId: item.accountId, accountName: item.name, message });
      await sql`INSERT INTO meta_ads_account_snapshots (account_id, period_start, period_end, sync_error, synced_at) VALUES (${item.id}, ${period.startDate}, ${period.endDate}, ${message}, NOW()) ON CONFLICT (account_id, period_start, period_end) DO UPDATE SET sync_error = EXCLUDED.sync_error, synced_at = NOW()`;
    }
      item = queue.shift();
    }
  };
  // Três contas por vez mantém a resposta rápida sem criar um pico de chamadas na API da Meta.
  await Promise.all(Array.from({ length: Math.min(3, connection.accounts.length) }, runWorker));
  console.info("[meta-ads/sync] completed", { accounts: connection.accounts.length, synced, failed: failed.length, period });
  return { synced, failed, data: await getMetaAdsDashboardData(period) };
}
