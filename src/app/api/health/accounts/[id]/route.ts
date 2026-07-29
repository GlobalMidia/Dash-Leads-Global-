import { NextResponse } from "next/server";
import { getDashboardUser } from "@/server/dashboard-auth";
import {
  getClientAccountDetails,
  setClientAccountActive,
  updateClientAccountInformation,
} from "@/server/client-health-repository";

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
  const actor = await getDashboardUser();
  if (!actor) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const accountId = (await params).id;
  const auditActor = { userId: actor.id, email: actor.email, name: actor.name };

  if (typeof body?.active === "boolean") {
    const account = await setClientAccountActive(accountId, body.active, auditActor);
    return account
      ? NextResponse.json({ account })
      : NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  }

  const name = String(body?.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Informe o nome da conta." }, { status: 400 });
  const account = await updateClientAccountInformation(accountId, {
    name,
    nucleus: String(body?.nucleus ?? "").trim(),
    accountHead: String(body?.accountHead ?? "").trim(),
    direction: String(body?.direction ?? "").trim(),
  }, auditActor);
  return account
    ? NextResponse.json({ account })
    : NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
}
