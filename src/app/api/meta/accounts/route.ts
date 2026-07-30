import { NextResponse } from "next/server";
import { getDashboardUser } from "@/server/dashboard-auth";
import { canManageMetaConnection } from "@/server/meta-oauth";
import { getMetaAdsDashboardData, saveMetaAdsSelections } from "@/server/meta-ads-reporting";

export async function GET() {
  if (!(await getDashboardUser())) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    return NextResponse.json({ data: await getMetaAdsDashboardData() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível carregar as contas da Meta." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await getDashboardUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!canManageMetaConnection(user.email)) {
    return NextResponse.json({ error: "Somente os e-mails definidos como responsáveis podem alterar as contas acompanhadas." }, { status: 403 });
  }

  try {
    const payload = await request.json() as { accountIds?: unknown };
    if (!Array.isArray(payload.accountIds) || !payload.accountIds.every((id) => typeof id === "string")) {
      return NextResponse.json({ error: "Informe a lista de contas a acompanhar." }, { status: 400 });
    }
    return NextResponse.json({ data: await saveMetaAdsSelections(payload.accountIds, user.email) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível salvar as contas selecionadas." }, { status: 500 });
  }
}
