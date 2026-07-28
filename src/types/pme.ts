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
  importBatches: PmeImportBatch[];
};

export type PmeImportBatch = {
  id: string;
  fileName: string;
  importedRows: number;
  ignoredRows: number;
  sourceSheets: string[];
  importedByName: string;
  importedByEmail: string;
  createdAt: string;
};

export type PmeImportBatchRecord = {
  id: string;
  sourceSheet: string;
  sourceRow: number;
  category: string;
  companyName: string;
  contactName: string;
  phone: string;
  historicStatus: string;
};

export type PmeImportBatchDetails = PmeImportBatch & {
  records: PmeImportBatchRecord[];
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
