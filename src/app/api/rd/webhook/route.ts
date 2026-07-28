import { NextResponse } from "next/server";
import { extractRdContacts, normalizeRdContact } from "@/lib/rd/normalize";
import { isLiveMode, upsertLeads } from "@/server/lead-repository";

const MAX_BODY_BYTES = 256_000;

function isValidSecret(request: Request) {
  const configuredSecret = process.env.RD_WEBHOOK_SECRET;
  const receivedSecret =
    request.headers.get("x-rd-webhook-secret") ??
    new URL(request.url).searchParams.get("token");
  return Boolean(configuredSecret && receivedSecret === configuredSecret);
}

export async function POST(request: Request) {
  if (!isValidSecret(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!isLiveMode()) {
    return NextResponse.json(
      { error: "Configure DATABASE_URL antes de ativar o webhook." },
      { status: 503 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Payload acima do limite permitido." },
      { status: 413 },
    );
  }

  const rawBody = await request.text();
  // O RD faz uma chamada sem conteúdo ao validar a URL no momento do cadastro.
  // Responder 204 aqui permite a ativação sem gravar nenhum contato vazio.
  if (!rawBody.trim()) {
    return new NextResponse(null, { status: 204 });
  }

  const payload = (() => {
    try {
      return JSON.parse(rawBody) as unknown;
    } catch {
      return null;
    }
  })();
  if (!payload) {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const leads = extractRdContacts(payload)
    .map(normalizeRdContact)
    .filter((lead) => lead !== null);
  await upsertLeads(leads);

  return NextResponse.json({ received: leads.length }, { status: 202 });
}
