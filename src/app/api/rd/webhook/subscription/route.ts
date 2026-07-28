import { NextResponse } from "next/server";
import { isDashboardAuthorized } from "@/server/dashboard-auth";
import { isLiveMode } from "@/server/lead-repository";
import {
  configureRdConversionWebhook,
  isRdConfigured,
  isRdConversionWebhookActive,
} from "@/server/rd-client";

export const maxDuration = 20;

async function canConfigureWebhook() {
  if (!(await isDashboardAuthorized())) {
    return { error: NextResponse.json({ error: "Não autorizado." }, { status: 401 }) };
  }
  if (!isLiveMode() || !isRdConfigured()) {
    return {
      error: NextResponse.json(
        { error: "Conecte o RD Station antes de ativar as entradas automáticas." },
        { status: 503 },
      ),
    };
  }
  return { error: null };
}

export async function GET(request: Request) {
  const guard = await canConfigureWebhook();
  if (guard.error) return guard.error;

  try {
    const active = await isRdConversionWebhookActive(new URL(request.url).origin);
    return NextResponse.json({ active });
  } catch (error) {
    console.error("Falha ao consultar webhook do RD Station:", error);
    return NextResponse.json(
      { error: "Não foi possível confirmar o status das entradas automáticas." },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const guard = await canConfigureWebhook();
  if (guard.error) return guard.error;

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
