import { NextResponse } from "next/server";
import { getDashboardUser } from "@/server/dashboard-auth";
import { getGoogleAdsDashboardData } from "@/server/google-ads-reporting";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getDashboardUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const url = new URL(request.url);
  const data = await getGoogleAdsDashboardData({ startDate: url.searchParams.get("startDate") ?? undefined, endDate: url.searchParams.get("endDate") ?? undefined });
  return NextResponse.json({ data });
}
