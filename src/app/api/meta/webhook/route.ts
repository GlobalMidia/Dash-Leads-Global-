import { NextRequest, NextResponse } from "next/server";
import {
  hasValidMetaWebhookSignature,
  metaWebhookVerifyToken,
  processMetaLeadWebhookEvents,
  storeMetaLeadWebhook,
} from "@/server/meta-lead-webhook";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const expected = metaWebhookVerifyToken();
  if (mode === "subscribe" && expected && token === expected && challenge) return new NextResponse(challenge, { status: 200 });
  return NextResponse.json({ error: "Verificação do webhook recusada." }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!hasValidMetaWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    console.warn("[meta/lead-webhook] invalid signature");
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }
  try {
    const stored = await storeMetaLeadWebhook(rawBody);
    const result = await processMetaLeadWebhookEvents(stored.events);
    console.info("[meta/lead-webhook] received", { stored: stored.stored, ...result });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[meta/lead-webhook] failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Não foi possível registrar o evento." }, { status: 500 });
  }
}
