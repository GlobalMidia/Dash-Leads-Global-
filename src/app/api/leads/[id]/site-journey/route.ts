import { NextResponse } from "next/server";
import { isDashboardAuthorized } from "@/server/dashboard-auth";
import { getSiteJourneyForLead } from "@/server/site-tracking-repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isDashboardAuthorized())) {
    return NextResponse.json({ error: "NÃ£o autorizado." }, { status: 401 });
  }

  try {
    const journey = await getSiteJourneyForLead((await params).id);
    return NextResponse.json({ journey });
  } catch (error) {
    console.error("[site-journey] failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "NÃ£o foi possÃ­vel consultar a jornada." }, { status: 500 });
  }
}
