import { NextResponse } from "next/server";
import { isDashboardAuthorized } from "@/server/dashboard-auth";
import { isLiveMode, listLeads } from "@/server/lead-repository";

export async function GET() {
  if (!(await isDashboardAuthorized())) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  return NextResponse.json({
    leads: await listLeads(),
    mode: isLiveMode() ? "live" : "demo",
  });
}
