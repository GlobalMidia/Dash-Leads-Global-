export type MetaAdsAccount = {
  id: string;
  accountId: string;
  name: string;
  currency: string;
  status: number | null;
  selected: boolean;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  leads: number;
  campaignCount: number;
  syncedAt: string | null;
  syncError: string | null;
};

export type MetaAdsDashboardData = {
  connected: boolean;
  accountName: string | null;
  accounts: MetaAdsAccount[];
  selectedCount: number;
  lastSyncAt: string | null;
};
