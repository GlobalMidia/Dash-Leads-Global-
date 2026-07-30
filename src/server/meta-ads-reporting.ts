import "server-only";

import { getSql } from "@/server/db";
import { getMetaConnectionForReporting, type StoredMetaAdAccount } from "@/server/meta-oauth";
import type { MetaAdsAccount, MetaAdsDashboardData } from "@/types/meta-ads";

const META_GRAPH_BASE = "https://graph.facebook.com";

type SnapshotRow = {
  account_id: string;
  account_name: string;
  account_number: string;
  currency: string;
  account_status: number | null;
  selected: boolean;
  spend: string | number | null;
  impressions: string | number | null;
  clicks: string | number | null;
  reach: string | number | null;
  leads: string | number | null;
  campaign_count: string | number | null;
  synced_at: Date | string | null;
  sync_error: string | null;
};

function apiVersion() {
  return process.env.META_GRAPH_API_VERSION || "v25.0";
}

function number(value: string | number | null | undefined) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function toAccount(row: SnapshotRow): MetaAdsAccount {
  return {
    id: row.account_id,
    accountId: row.account_number,
    name: row.account_name || "Conta sem nome",
    currency: row.currency,
    status: row.account_status,
    selected: row.selected,
    spend: number(row.spend),
    impressions: number(row.impressions),
    clicks: number(row.clicks),
    reach: number(row.reach),
    leads: number(row.leads),
    campaignCount: number(row.campaign_count),
    syncedAt: row.synced_at ? new Date(row.synced_at).toISOString() : null,
    syncError: row.sync_error,
  };
}

async function selectionRows() {
  const sql = getSql();
  return (await sql`
    SELECT
      selection.account_id,
      selection.account_name,
      selection.account_number,
      selection.currency,
      selection.account_status,
      selection.selected,
      snapshot.spend,
      snapshot.impressions,
      snapshot.clicks,
      snapshot.reach,
      snapshot.leads,
      snapshot.campaign_count,
      snapshot.synced_at,
      snapshot.sync_error
    FROM meta_ads_account_selections selection
    LEFT JOIN LATERAL (
      SELECT spend, impressions, clicks, reach, leads, campaign_count, synced_at, sync_error
      FROM meta_ads_account_snapshots
      WHERE account_id = selection.account_id
      ORDER BY synced_at DESC
      LIMIT 1
    ) snapshot ON true
    ORDER BY selection.selected DESC, selection.account_name ASC
  `) as SnapshotRow[];
}

export async function getMetaAdsDashboardData(): Promise<MetaAdsDashboardData> {
  const connection = await getMetaConnectionForReporting();
  if (!connection) return { connected: false, accountName: null, accounts: [], selectedCount: 0, lastSyncAt: null };

  const selections = await selectionRows();
  const byId = new Map(selections.map((selection) => [selection.account_id, selection]));
  const accounts = connection.accounts.map((account) => {
    const selection = byId.get(account.id);
    return toAccount(selection ?? {
      account_id: account.id,
      account_name: account.name,
      account_number: account.accountId,
      currency: account.currency,
      account_status: account.status,
      selected: false,
      spend: 0,
      impressions: 0,
      clicks: 0,
      reach: 0,
      leads: 0,
      campaign_count: 0,
      synced_at: null,
      sync_error: null,
    });
  }).sort((left, right) => Number(right.selected) - Number(left.selected) || left.name.localeCompare(right.name, "pt-BR"));
  const selectedCount = accounts.filter((account) => account.selected).length;
  const lastSync = accounts
    .map((account) => account.syncedAt ? new Date(account.syncedAt).getTime() : 0)
    .reduce((latest, value) => Math.max(latest, value), 0);
  return {
    connected: true,
    accountName: null,
    accounts,
    selectedCount,
    lastSyncAt: lastSync ? new Date(lastSync).toISOString() : null,
  };
}

export async function saveMetaAdsSelections(accountIds: string[], actorEmail: string) {
  const connection = await getMetaConnectionForReporting();
  if (!connection) throw new Error("Conecte a conta corporativa da Meta antes de selecionar contas.");
  const selected = new Set(accountIds);
  const available = new Map(connection.accounts.map((account) => [account.id, account]));
  for (const accountId of selected) {
    if (!available.has(accountId)) throw new Error("Uma das contas selecionadas não pertence à conexão corporativa atual.");
  }

  const sql = getSql();
  await Promise.all(connection.accounts.map((account) => sql`
    INSERT INTO meta_ads_account_selections (
      account_id, account_name, account_number, currency, account_status,
      selected, selected_by_email, selected_at, updated_at
    ) VALUES (
      ${account.id}, ${account.name}, ${account.accountId}, ${account.currency}, ${account.status},
      ${selected.has(account.id)}, ${actorEmail}, ${selected.has(account.id) ? new Date() : null}, NOW()
    )
    ON CONFLICT (account_id) DO UPDATE SET
      account_name = EXCLUDED.account_name,
      account_number = EXCLUDED.account_number,
      currency = EXCLUDED.currency,
      account_status = EXCLUDED.account_status,
      selected = EXCLUDED.selected,
      selected_by_email = EXCLUDED.selected_by_email,
      selected_at = CASE WHEN EXCLUDED.selected THEN NOW() ELSE NULL END,
      updated_at = NOW()
  `));
  return getMetaAdsDashboardData();
}

type MetaInsight = {
  spend?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  actions?: Array<{ action_type?: string; value?: string }>;
};

type MetaResponse<T> = { data?: T[] };
type MetaCampaign = { id?: string; name?: string; status?: string; objective?: string; updated_time?: string };

async function getMetaJson<T>(url: URL): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Meta Ads recusou a sincronização (${response.status})${details ? `: ${details.slice(0, 180)}` : ""}`);
  }
  return (await response.json()) as T;
}

function countLeads(actions: MetaInsight["actions"]) {
  return (actions ?? []).reduce((total, action) => {
    const type = action.action_type?.toLowerCase() ?? "";
    return type.includes("lead") ? total + number(action.value) : total;
  }, 0);
}

async function syncAccount(account: StoredMetaAdAccount, accessToken: string) {
  const root = `${META_GRAPH_BASE}/${apiVersion()}/${encodeURIComponent(account.id)}`;
  const insightsUrl = new URL(`${root}/insights`);
  insightsUrl.searchParams.set("fields", "spend,impressions,clicks,reach,actions");
  insightsUrl.searchParams.set("date_preset", "last_30d");
  insightsUrl.searchParams.set("level", "account");
  insightsUrl.searchParams.set("limit", "1");
  insightsUrl.searchParams.set("access_token", accessToken);

  const campaignsUrl = new URL(`${root}/campaigns`);
  campaignsUrl.searchParams.set("fields", "id,name,status,objective,updated_time");
  campaignsUrl.searchParams.set("limit", "250");
  campaignsUrl.searchParams.set("access_token", accessToken);

  const [insightsResponse, campaignsResponse] = await Promise.all([
    getMetaJson<MetaResponse<MetaInsight>>(insightsUrl),
    getMetaJson<MetaResponse<MetaCampaign>>(campaignsUrl),
  ]);
  const insight = insightsResponse.data?.[0] ?? {};
  return {
    spend: number(insight.spend),
    impressions: number(insight.impressions),
    clicks: number(insight.clicks),
    reach: number(insight.reach),
    leads: countLeads(insight.actions),
    campaigns: campaignsResponse.data ?? [],
  };
}

export async function syncSelectedMetaAdsAccounts() {
  const connection = await getMetaConnectionForReporting();
  if (!connection) throw new Error("A conta corporativa do Meta Ads não está conectada.");
  const rows = await selectionRows();
  const available = new Map(connection.accounts.map((account) => [account.id, account]));
  const selected = rows.filter((row) => row.selected).flatMap((row) => available.get(row.account_id) ?? []);
  if (!selected.length) throw new Error("Selecione pelo menos uma conta de anúncios para sincronizar.");

  const sql = getSql();
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd);
  periodStart.setDate(periodEnd.getDate() - 29);
  const start = periodStart.toISOString().slice(0, 10);
  const end = periodEnd.toISOString().slice(0, 10);
  let synced = 0;
  const failed: string[] = [];

  for (const account of selected) {
    try {
      const snapshot = await syncAccount(account, connection.accessToken);
      await sql`
        INSERT INTO meta_ads_account_snapshots (
          account_id, period_start, period_end, spend, impressions, clicks, reach, leads,
          campaign_count, campaigns, sync_error, synced_at
        ) VALUES (
          ${account.id}, ${start}, ${end}, ${snapshot.spend}, ${snapshot.impressions}, ${snapshot.clicks}, ${snapshot.reach}, ${snapshot.leads},
          ${snapshot.campaigns.length}, ${JSON.stringify(snapshot.campaigns)}::jsonb, NULL, NOW()
        )
        ON CONFLICT (account_id, period_start, period_end) DO UPDATE SET
          spend = EXCLUDED.spend, impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks,
          reach = EXCLUDED.reach, leads = EXCLUDED.leads, campaign_count = EXCLUDED.campaign_count,
          campaigns = EXCLUDED.campaigns, sync_error = NULL, synced_at = NOW()
      `;
      synced += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 900) : "Falha desconhecida ao consultar a conta.";
      failed.push(account.name);
      await sql`
        INSERT INTO meta_ads_account_snapshots (account_id, period_start, period_end, sync_error, synced_at)
        VALUES (${account.id}, ${start}, ${end}, ${message}, NOW())
        ON CONFLICT (account_id, period_start, period_end) DO UPDATE SET sync_error = EXCLUDED.sync_error, synced_at = NOW()
      `;
    }
  }

  return { synced, failed, data: await getMetaAdsDashboardData() };
}
