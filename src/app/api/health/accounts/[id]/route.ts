import { NextResponse } from "next/server";
import { getDashboardUser } from "@/server/dashboard-auth";
import { getClientAccountDetails, setClientAccountActive } from "@/server/client-health-repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getDashboardUser())) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const account = await getClientAccountDetails((await params).id);
  return account
    ? NextResponse.json({ account })
    : NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getDashboardUser())) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (typeof body?.active !== "boolean") return NextResponse.json({ error: "Estado da conta inválido." }, { status: 400 });
  const account = await setClientAccountActive((await params).id, body.active);
  return account
    ? NextResponse.json({ account })
    : NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
}
