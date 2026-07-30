export type MetaAdsCampaign = {
  id: string;
  name: string;
  status: string;
  objective: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  leads: number;
  ctr: number;
  cpc: number;
};

export type MetaAdsPeriod = { startDate: string; endDate: string };

export type MetaAdsAccount = {
  id: string;
  accountId: string;
  name: string;
  currency: string;
  status: number | null;
  selected: boolean;
  archived: boolean;
  archivedAt: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  leads: number;
  campaignCount: number;
  campaigns: MetaAdsCampaign[];
  syncedAt: string | null;
  syncError: string | null;
};

export type MetaAdsDashboardData = {
  connected: boolean;
  accountName: string | null;
  accounts: MetaAdsAccount[];
  selectedCount: number;
  lastSyncAt: string | null;
  period: MetaAdsPeriod;
};
