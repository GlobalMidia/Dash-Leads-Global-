import { NextResponse } from "next/server";
import { isDashboardAuthorized } from "@/server/dashboard-auth";
import { getPmeImportBatchDetails } from "@/server/pme-repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isDashboardAuthorized())) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const batch = await getPmeImportBatchDetails((await params).id);
  return batch
    ? NextResponse.json({ batch })
    : NextResponse.json({ error: "Planilha não encontrada." }, { status: 404 });
}
