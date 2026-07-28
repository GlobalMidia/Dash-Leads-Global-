export type AccountHealth = "green" | "yellow" | "red" | "unassessed";

export type ClientAccount = {
  id: string;
  name: string;
  profileUrl: string;
  healthStatus: AccountHealth;
  active: boolean;
  nucleus: string;
  accountHead: string;
  direction: string;
  lastReviewAt: string | null;
  openPendencies: number;
  createdAt: string;
  updatedAt: string;
};
