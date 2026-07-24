import { NextResponse } from "next/server";
import { z } from "zod";
import { isDashboardAuthorized } from "@/server/dashboard-auth";
import { importCsvLeads } from "@/server/lead-repository";
import { LEAD_STATUSES } from "@/types/lead";

const matchSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("company"),
      label: z.string().max(300),
      matchedLeadId: z.uuid().optional(),
      sourceFile: z.string().max(255).optional(),
    }),
    z.object({
      kind: z.literal("contact"),
      label: z.string().max(300),
      matchedLeadId: z.uuid(),
      sourceFile: z.string().max(255).optional(),
    }),
  ])
  .nullable();

const recordSchema = z.object({
  rowNumber: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  company: z.string().trim().max(200),
  email: z.string().trim().max(320),
  phone: z.string().trim().max(60),
  origin: z.string().trim().max(100),
  enteredAt: z.iso.datetime(),
  status: z.enum(LEAD_STATUSES),
  notes: z.string().trim().max(280),
  additionalData: z
    .record(z.string().max(120), z.string().max(2000))
    .refine((value) => Object.keys(value).length <= 100),
  match: matchSchema,
});

const importSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  records: z.array(recordSchema).min(1).max(1000),
  groupedRowNumbers: z.array(z.number().int().positive()).max(1000),
});

export async function POST(request: Request) {
  if (!(await isDashboardAuthorized())) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: "A importação deve ter no máximo 5 MB." },
      { status: 413 },
    );
  }

  const parsed = importSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "O arquivo contém dados inválidos ou ultrapassa o limite de 1.000 registros.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await importCsvLeads(parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível importar os leads.",
      },
      { status: 503 },
    );
  }
}
