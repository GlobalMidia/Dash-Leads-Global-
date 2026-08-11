import { NextResponse } from "next/server";
import { isDashboardAuthorized } from "@/server/dashboard-auth";
import { getGa4Properties, getGa4Report } from "@/server/ga4-reporting";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await isDashboardAuthorized())) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const url = new URL(request.url);
  const propertyId = url.searchParams.get("propertyId");
  if (propertyId) {
    try {
      const endDate = url.searchParams.get("endDate") ?? new Date().toISOString().slice(0, 10);
      const startDate = url.searchParams.get("startDate") ?? new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
      return NextResponse.json({ report: await getGa4Report(propertyId, startDate, endDate) }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível consultar o relatório." }, { status: 502 });
    }
  }
  return NextResponse.json(await getGa4Properties(), { headers: { "Cache-Control": "no-store" } });
}
