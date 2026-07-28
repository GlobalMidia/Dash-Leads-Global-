export type PmeImportRecord = {
  sourceSheet: string;
  sourceRow: number;
  category: string;
  companyName: string;
  contactName: string;
  phone: string;
  website: string;
  historicStatus: string;
  historicValue: number | null;
  recordedAt: string | null;
  contactAt: string | null;
  displayedAt: string | null;
  notes: string;
  sourceData: Record<string, string>;
};

export type PmeCompany = {
  normalizedCompany: string;
  companyName: string;
  contacts: string;
  phones: string;
  website: string;
  latestStatus: string;
  latestActivityAt: string | null;
  historicValue: number | null;
  notes: string;
  categories: string[];
  sourceSheets: string[];
  recordCount: number;
};

export type PmeDirectoryData = {
  companies: PmeCompany[];
  importedRecords: number;
  latestImportAt: string | null;
};

export type PmeCompanyRecord = {
  id: string;
  sourceSheet: string;
  sourceRow: number;
  category: string;
  contactName: string;
  phone: string;
  website: string;
  historicStatus: string;
  historicValue: number | null;
  recordedAt: string | null;
  contactAt: string | null;
  displayedAt: string | null;
  notes: string;
  sourceData: Record<string, string>;
};

export type PmeCompanyDetails = PmeCompany & {
  records: PmeCompanyRecord[];
};
