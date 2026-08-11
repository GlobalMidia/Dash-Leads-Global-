export type Ga4Property = { id: string; name: string; accountId: string; accountName: string };

export type Ga4Report = {
  propertyId: string;
  startDate: string;
  endDate: string;
  totals: { activeUsers: number; sessions: number; conversions: number; eventCount: number };
  byChannel: Array<{ channel: string; sessions: number; conversions: number }>;
  byDate: Array<{ date: string; activeUsers: number; sessions: number; conversions: number }>;
};
