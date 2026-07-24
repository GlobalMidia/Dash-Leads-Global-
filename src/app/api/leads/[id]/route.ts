import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getDashboardUser,
  isDashboardAuthorized,
} from "@/server/dashboard-auth";
import { updateLead } from "@/server/lead-repository";
import { LEAD_STATUSES } from "@/types/lead";

const schema = z
  .object({
    status: z.enum(LEAD_STATUSES).optional(),
    notes: z.string().trim().max(280).optional(),
  })
  .refine((value) => value.status !== undefined || value.notes !== undefined);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isDashboardAuthorized())) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  try {
    const id = (await params).id;
    const actor = await getDashboardUser();
    const lead = await updateLead(id, parsed.data, {
      userId: actor?.id,
      email: actor?.email,
      name: actor?.name,
    });
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
