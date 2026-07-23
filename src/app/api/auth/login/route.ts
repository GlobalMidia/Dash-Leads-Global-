import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authIsConfigured,
  createDashboardSession,
  verifyPassword,
} from "@/server/dashboard-auth";

const schema = z.object({ password: z.string().min(1).max(256) });

export async function POST(request: Request) {
  if (!authIsConfigured()) {
    return NextResponse.json(
      { error: "A proteção do dashboard ainda não foi configurada." },
      { status: 503 },
    );
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !verifyPassword(parsed.data.password)) {
    return NextResponse.json({ error: "Senha inválida." }, { status: 401 });
  }

  await createDashboardSession();
  return NextResponse.json({ ok: true });
}
