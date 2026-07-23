import { NextResponse } from "next/server";
import { z } from "zod";
import { isDashboardAuthorized } from "@/server/dashboard-auth";
import { updateLeadStatus } from "@/server/lead-repository";
import { LEAD_STATUSES } from "@/types/lead";

const schema = z.object({ status: z.enum(LEAD_STATUSES) });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isDashboardAuthorized())) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  }

  try {
    const lead = await updateLeadStatus((await params).id, parsed.data.status);
    if (!lead) {
      return NextResponse.json(
        { error: "Lead não encontrado." },
        { status: 404 },
      );
    }
    return NextResponse.json({ lead });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao atualizar." },
      { status: 503 },
    );
  }
}
