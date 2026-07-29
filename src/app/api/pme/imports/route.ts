import { NextResponse } from "next/server";
import { z } from "zod";
import { getDashboardUser, isDashboardAuthorized } from "@/server/dashboard-auth";
import { importPmeRecords } from "@/server/pme-repository";

const recordSchema = z.object({
  sourceSheet: z.string().trim().min(1).max(160),
  sourceRow: z.number().int().positive(),
  category: z.string().trim().min(1).max(80),
  companyName: z.string().trim().min(1).max(300),
  contactName: z.string().trim().max(300),
  phone: z.string().trim().max(80),
  website: z.string().trim().max(1000),
  historicStatus: z.string().trim().max(1000),
  historicValue: z.number().finite().nullable(),
  recordedAt: z.iso.date().nullable(),
  contactAt: z.iso.date().nullable(),
  displayedAt: z.iso.date().nullable(),
  notes: z.string().trim().max(2000),
  sourceData: z.record(z.string().max(180), z.string().max(2000)).refine((data) => Object.keys(data).length <= 40),
});

const importSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/i),
  records: z.array(recordSchema).min(1).max(10_000),
  ignoredRows: z.number().int().min(0).max(10_000),
  sourceSheets: z.array(z.string().trim().min(1).max(160)).min(1).max(50),
});

export async function POST(request: Request) {
  if (!(await isDashboardAuthorized())) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 4 * 1024 * 1024) {
    return NextResponse.json({ error: "A importação PME ficou acima do limite de 4 MB." }, { status: 413 });
  }
  const parsed = importSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A planilha contém registros inválidos ou ultrapassa o limite de 10.000 linhas." }, { status: 400 });
  }
  try {
    const user = await getDashboardUser();
    const result = await importPmeRecords(parsed.data, {
      userId: user?.id,
      email: user?.email,
      name: user?.name,
    });
    return NextResponse.json(result, { status: result.alreadyImported ? 200 : 201 });
  } catch (error) {
    console.error("[api/pme/imports] import failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível importar a base PME." },
      { status: 503 },
    );
  }
}
