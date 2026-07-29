import { NextResponse } from "next/server";
import { purgeExpiredClosedClientAccounts } from "@/server/client-health-repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const deletedAccountIds = await purgeExpiredClosedClientAccounts();
    return NextResponse.json({
      ok: true,
      deletedAccounts: deletedAccountIds.length,
    });
  } catch (error) {
    console.error("Falha ao remover contas encerradas expiradas.", error);
    return NextResponse.json({ error: "Não foi possível concluir a limpeza programada." }, { status: 500 });
  }
}
