import { NextResponse } from "next/server";
import { getDashboardUser } from "@/server/dashboard-auth";
import { syncMetaAdsAccounts } from "@/server/meta-ads-reporting";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!(await getDashboardUser())) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const payload = await request.json().catch(() => ({})) as { startDate?: string; endDate?: string };
    return NextResponse.json(await syncMetaAdsAccounts(payload));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível sincronizar o Meta Ads." }, { status: 500 });
  }
}
