import { NextResponse } from "next/server";
import { z } from "zod";
import { getDashboardUser } from "@/server/dashboard-auth";
import { savePmeImportBatchOrder } from "@/server/pme-repository";

const orderSchema = z.object({
  batchIds: z.array(z.uuid()).max(1_000)
    .refine((batchIds) => new Set(batchIds).size === batchIds.length),
});

export async function PUT(request: Request) {
  const user = await getDashboardUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const parsed = orderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A ordem enviada é inválida." }, { status: 400 });
  }

  try {
    await savePmeImportBatchOrder(user.id, parsed.data.batchIds);
    return NextResponse.json({ saved: true });
  } catch (error) {
    console.error("[api/pme/imports/order] save failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Não foi possível salvar a ordem das planilhas." },
      { status: 503 },
    );
  }
}
