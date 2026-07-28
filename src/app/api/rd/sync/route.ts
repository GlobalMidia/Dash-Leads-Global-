import { NextResponse } from "next/server";
import { isDashboardAuthorized } from "@/server/dashboard-auth";
import { isLiveMode, upsertLeads } from "@/server/lead-repository";
import { importNextRdBatch, isRdConfigured } from "@/server/rd-client";

export const maxDuration = 60;

export async function POST() {
  if (!(await isDashboardAuthorized())) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!isLiveMode() || !isRdConfigured()) {
    return NextResponse.json(
      {
        error:
          "Configure o banco e as credenciais OAuth do RD Station para sincronizar.",
      },
      { status: 503 },
    );
  }

  try {
    const batch = await importNextRdBatch();
    const imported = await upsertLeads(batch.contacts);
    return NextResponse.json({
      imported,
      hasMore: batch.hasMore,
      page: batch.page,
      processed: batch.processed,
      total: batch.total,
      detailsCompleted: batch.detailsCompleted,
      detailsTotal: batch.detailsTotal,
    });
  } catch (error) {
    console.error("Falha na sincronização com o RD Station:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível sincronizar com o RD Station.",
      },
      { status: 502 },
    );
  }
}
