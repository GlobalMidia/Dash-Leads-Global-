import { NextResponse } from "next/server";
import { normalizeCnpj } from "@/lib/client-health";
import { getDashboardUser } from "@/server/dashboard-auth";
import { createClientAccount, listClientAccounts } from "@/server/client-health-repository";

export async function GET(request: Request) {
  if (!(await getDashboardUser())) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const requestedStatus = new URL(request.url).searchParams.get("status");
  const status = requestedStatus === "closed" || requestedStatus === "all"
    ? requestedStatus
    : "active";
  return NextResponse.json({ accounts: await listClientAccounts(status) });
}

export async function POST(request: Request) {
  const actor = await getDashboardUser();
  if (!actor) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = String(body?.name ?? "").trim();
  const rawCnpj = String(body?.cnpj ?? "").trim();
  const cnpj = normalizeCnpj(rawCnpj);
  const profileUrl = String(body?.profileUrl ?? "").trim();
  if (!name) return NextResponse.json({ error: "Informe o nome do cliente." }, { status: 400 });
  if (cnpj && cnpj.length !== 14) {
    return NextResponse.json({ error: "O CNPJ deve possuir 14 números." }, { status: 400 });
  }
  if (!profileUrl || !/^https?:\/\/[^\s]+$/i.test(profileUrl)) {
    return NextResponse.json({ error: "Informe um link profissional começando com http:// ou https://." }, { status: 400 });
  }

  try {
    const account = await createClientAccount({
      name,
      cnpj,
      profileUrl,
      nucleus: String(body?.nucleus ?? "").trim(),
      accountHead: String(body?.accountHead ?? "").trim(),
      direction: String(body?.direction ?? "").trim(),
    }, { userId: actor.id, email: actor.email, name: actor.name });
    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível cadastrar a conta." }, { status: 500 });
  }
}
