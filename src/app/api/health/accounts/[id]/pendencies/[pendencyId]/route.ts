import { NextResponse } from "next/server";
import { getDashboardUser } from "@/server/dashboard-auth";
import { setClientPendencyCompletion } from "@/server/client-health-repository";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; pendencyId: string }> }) {
  const actor = await getDashboardUser();
  if (!actor) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (typeof body?.completed !== "boolean") return NextResponse.json({ error: "Estado da pendência inválido." }, { status: 400 });
  const { id, pendencyId } = await params;
  const pendency = await setClientPendencyCompletion({ accountId: id, pendencyId, completed: body.completed, actorId: actor.id });
  return pendency
    ? NextResponse.json({ pendency })
    : NextResponse.json({ error: "Pendência não encontrada." }, { status: 404 });
}
