import { NextResponse } from "next/server";
import { isDashboardAuthorized } from "@/server/dashboard-auth";
import { isLiveMode } from "@/server/lead-repository";
import { configureRdConversionWebhook, isRdConfigured } from "@/server/rd-client";

export const maxDuration = 20;

export async function POST(request: Request) {
  if (!(await isDashboardAuthorized())) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!isLiveMode() || !isRdConfigured()) {
    return NextResponse.json(
      { error: "Conecte o RD Station antes de ativar as entradas automáticas." },
      { status: 503 },
    );
  }

  try {
    const result = await configureRdConversionWebhook(new URL(request.url).origin);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Falha ao configurar webhook do RD Station:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível ativar as entradas automáticas do RD Station.",
      },
      { status: 502 },
    );
  }
}
