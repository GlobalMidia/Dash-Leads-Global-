import { NextResponse } from "next/server";
import { z } from "zod";
import { getDashboardUser } from "@/server/dashboard-auth";
import { addClientPendency } from "@/server/client-health-repository";

const schema = z.object({ title: z.string().trim().min(1).max(240), reviewWeek: z.iso.date() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getDashboardUser();
  if (!actor) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Informe uma pendência válida." }, { status: 400 });
  try {
    const pendency = await addClientPendency({ ...parsed.data, accountId: (await params).id, actorId: actor.id });
    return NextResponse.json({ pendency }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível criar a pendência." }, { status: 503 });
  }
}
