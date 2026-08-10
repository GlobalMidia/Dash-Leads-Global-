import { NextResponse } from "next/server";
import { isDashboardAuthorized } from "@/server/dashboard-auth";
import { getGa4Properties } from "@/server/ga4-reporting";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isDashboardAuthorized())) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  return NextResponse.json(await getGa4Properties(), { headers: { "Cache-Control": "no-store" } });
}
