import { NextResponse } from "next/server";
import { getDashboardUser } from "@/server/dashboard-auth";
import { syncMetaAdsAccounts } from "@/server/meta-ads-reporting";

export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await getDashboardUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const payload = await request.json().catch(() => ({})) as { startDate?: string; endDate?: string };
    console.info("[api/meta/sync] request", { userEmail: user.email, startDate: payload.startDate, endDate: payload.endDate });
    return NextResponse.json(await syncMetaAdsAccounts(payload));
  } catch (error) {
    console.error("[api/meta/sync] failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível sincronizar o Meta Ads." }, { status: 500 });
  }
}
