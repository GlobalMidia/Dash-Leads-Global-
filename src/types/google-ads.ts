export type GoogleAdsPeriod = { startDate: string; endDate: string };

export type GoogleAdsCampaign = {
  id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpc: number;
};

export type GoogleAdsAccount = {
  id: string;
  name: string;
  currency: string;
  timeZone: string;
  manager: boolean;
  campaigns: GoogleAdsCampaign[];
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  syncedAt: string | null;
  error: string | null;
};

export type GoogleAdsDashboardData = {
  configured: boolean;
  accounts: GoogleAdsAccount[];
  period: GoogleAdsPeriod;
  lastUpdated: string | null;
  error: string | null;
};
