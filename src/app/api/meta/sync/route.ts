import { NextResponse } from "next/server";
import { getDashboardUser } from "@/server/dashboard-auth";
import { syncSelectedMetaAdsAccounts } from "@/server/meta-ads-reporting";

export const maxDuration = 60;

export async function POST() {
  if (!(await getDashboardUser())) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    return NextResponse.json(await syncSelectedMetaAdsAccounts());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível sincronizar o Meta Ads." }, { status: 500 });
  }
}
