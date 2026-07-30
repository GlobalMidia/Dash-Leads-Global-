import { NextResponse } from "next/server";
import { getDashboardUser } from "@/server/dashboard-auth";
import { canManageMetaConnection } from "@/server/meta-oauth";
import { setMetaAdsAccountArchived } from "@/server/meta-ads-reporting";

export async function PATCH(request: Request, context: { params: Promise<{ accountId: string }> }) {
  const user = await getDashboardUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!canManageMetaConnection(user.email)) return NextResponse.json({ error: "Você não tem permissão para arquivar contas." }, { status: 403 });

  try {
    const { accountId } = await context.params;
    const payload = await request.json() as { archived?: unknown; startDate?: unknown; endDate?: unknown };
    if (typeof payload.archived !== "boolean") return NextResponse.json({ error: "Informe se a conta deve ser arquivada." }, { status: 400 });
    const data = await setMetaAdsAccountArchived(accountId, payload.archived, user.email, {
      startDate: typeof payload.startDate === "string" ? payload.startDate : undefined,
      endDate: typeof payload.endDate === "string" ? payload.endDate : undefined,
    });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível alterar o arquivamento da conta." }, { status: 500 });
  }
}
