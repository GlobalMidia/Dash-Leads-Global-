import { NextResponse } from "next/server";
import { z } from "zod";
import { getDashboardUser } from "@/server/dashboard-auth";
import { saveClientHealthReview } from "@/server/client-health-repository";

const schema = z.object({
  healthStatus: z.enum(["green", "yellow", "red"]),
  satisfaction: z.enum(["satisfied", "neutral", "dissatisfied", "unknown"]),
  deliveryStatus: z.enum(["on_track", "attention", "late", "unknown"]),
  notes: z.string().trim().max(1200),
  reviewWeek: z.iso.date(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getDashboardUser();
  if (!actor) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Preencha os campos da avaliação corretamente." }, { status: 400 });
  try {
    const review = await saveClientHealthReview({ ...parsed.data, accountId: (await params).id, actorId: actor.id });
    return NextResponse.json({ review });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível salvar a avaliação." }, { status: 503 });
  }
}
