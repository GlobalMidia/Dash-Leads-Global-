import { NextResponse } from "next/server";
import { getDashboardUser } from "@/server/dashboard-auth";
import { createClientAccount, listClientAccounts } from "@/server/client-health-repository";

export async function GET() {
  if (!(await getDashboardUser())) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  return NextResponse.json({ accounts: await listClientAccounts() });
}

export async function POST(request: Request) {
  const actor = await getDashboardUser();
  if (!actor) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = String(body?.name ?? "").trim();
  const profileUrl = String(body?.profileUrl ?? "").trim();
  if (!name) return NextResponse.json({ error: "Informe o nome do cliente." }, { status: 400 });
  if (profileUrl && !/^https?:\/\/[^\s]+$/i.test(profileUrl)) {
    return NextResponse.json({ error: "O link deve começar com http:// ou https://." }, { status: 400 });
  }

  try {
    const account = await createClientAccount({
      name,
      profileUrl,
      nucleus: String(body?.nucleus ?? "").trim(),
      accountHead: String(body?.accountHead ?? "").trim(),
      direction: String(body?.direction ?? "").trim(),
    }, actor.id);
    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível cadastrar a conta." }, { status: 500 });
  }
}
