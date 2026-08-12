import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SITE_EVENT_NAMES } from "@/lib/site-journey";
import { storeSiteTrackingBatch } from "@/server/site-tracking-repository";

export const maxDuration = 15;

const eventSchema = z.object({
  id: z.uuid(),
  name: z.enum(SITE_EVENT_NAMES),
  occurredAt: z.iso.datetime(),
  pageUrl: z.url().max(1000),
  pageTitle: z.string().max(300).optional(),
  referrer: z.string().max(1000).optional(),
  data: z.record(z.string(), z.string().max(500)).optional(),
});

const batchSchema = z.object({
  visitorId: z.uuid(),
  sessionId: z.uuid(),
  sessionStartedAt: z.iso.datetime(),
  attribution: z.object({
    source: z.string().max(160).optional(),
    medium: z.string().max(160).optional(),
    campaign: z.string().max(300).optional(),
    content: z.string().max(300).optional(),
    term: z.string().max(300).optional(),
    gclid: z.string().max(300).optional(),
    fbclid: z.string().max(300).optional(),
  }),
  landingPage: z.url().max(1000),
  events: z.array(eventSchema).min(1).max(25),
  identity: z.object({
    name: z.string().max(300).optional(),
    email: z.string().max(320).optional(),
    phone: z.string().max(80).optional(),
    company: z.string().max(300).optional(),
  }).optional(),
});

function allowedOrigins() {
  return new Set(
    (process.env.SITE_TRACKING_ALLOWED_ORIGINS ?? "https://globalmidia.digital,https://www.globalmidia.digital")
      .split(",")
      .map((value) => value.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
}

function corsHeaders(origin: string | null) {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    Vary: "Origin",
  });
  if (origin && allowedOrigins().has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function isAllowedRequest(request: NextRequest) {
  const origin = request.headers.get("origin")?.replace(/\/$/, "") ?? null;
  return Boolean(origin && allowedOrigins().has(origin));
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin")?.replace(/\/$/, "") ?? null;
  return new NextResponse(null, {
    status: origin && allowedOrigins().has(origin) ? 204 : 403,
    headers: corsHeaders(origin),
  });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")?.replace(/\/$/, "") ?? null;
  const headers = corsHeaders(origin);
  if (!isAllowedRequest(request)) {
    return NextResponse.json({ error: "Domínio não autorizado." }, { status: 403, headers });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 80_000) {
    return NextResponse.json({ error: "Lote acima do limite." }, { status: 413, headers });
  }

  const parsed = batchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Eventos de navegação inválidos." }, { status: 400, headers });
  }

  if (parsed.data.events.some((event) => new URL(event.pageUrl).origin !== origin)) {
    return NextResponse.json({ error: "A página informada não pertence ao domínio autorizado." }, { status: 400, headers });
  }

  try {
    const result = await storeSiteTrackingBatch(parsed.data);
    return NextResponse.json({ ok: true, ...result }, { headers });
  } catch (error) {
    console.error("[site-tracking] failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Não foi possível registrar a jornada." }, { status: 500, headers });
  }
}
