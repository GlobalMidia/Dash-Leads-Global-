import { NextResponse } from "next/server";
import { z } from "zod";
import { getDashboardUser, isDashboardAuthorized } from "@/server/dashboard-auth";
import { deletePmeImportBatch, getPmeImportBatchDetails } from "@/server/pme-repository";

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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getDashboardUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const parsedId = z.uuid().safeParse((await params).id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Planilha inválida." }, { status: 400 });
  }

  try {
    const deleted = await deletePmeImportBatch(parsedId.data, {
      userId: user.id,
      email: user.email,
      name: user.name,
    });
    return deleted
      ? NextResponse.json(deleted)
      : NextResponse.json({ error: "Planilha não encontrada." }, { status: 404 });
  } catch (error) {
    console.error("[api/pme/imports/:id] delete failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Não foi possível remover a planilha." },
      { status: 503 },
    );
  }
}
