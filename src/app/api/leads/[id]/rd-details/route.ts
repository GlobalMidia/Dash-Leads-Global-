import { NextResponse } from "next/server";
import { isDashboardAuthorized } from "@/server/dashboard-auth";
import { getLeadById, isLiveMode, upsertLeads } from "@/server/lead-repository";
import { loadRdContactDetails } from "@/server/rd-client";

export const maxDuration = 20;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isDashboardAuthorized())) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!isLiveMode()) {
    return NextResponse.json({ error: "Dados do RD indisponíveis na demonstração." }, { status: 503 });
  }

  const id = (await params).id;
  const existing = await getLeadById(id);
  if (!existing) {
    return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });
  }
  if (!existing.rdUuid) {
    return NextResponse.json({ error: "Este registro não possui identificador do RD Station." }, { status: 422 });
  }

  try {
    const enriched = await loadRdContactDetails(existing.rdUuid);
    if (!enriched) {
      return NextResponse.json({ error: "O RD Station não retornou detalhes deste contato." }, { status: 404 });
    }
    await upsertLeads([enriched]);
    const lead = await getLeadById(id);
    return NextResponse.json({ lead });
  } catch (error) {
    console.error("[rd-details] falha ao obter detalhes do contato", {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao consultar os detalhes no RD Station." },
      { status: 502 },
    );
  }
}
