import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getSql } from "@/server/db";

type MetaLeadChange = { field?: unknown; value?: { leadgen_id?: unknown; page_id?: unknown; form_id?: unknown } };
type MetaWebhookPayload = { object?: unknown; entry?: Array<{ id?: unknown; changes?: MetaLeadChange[] }> };

export function metaWebhookVerifyToken() {
  return process.env.META_WEBHOOK_VERIFY_TOKEN ?? "";
}

export function hasValidMetaWebhookSignature(rawBody: string, signature: string | null) {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signature.slice("sha256=".length);
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(received, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function storeMetaLeadWebhook(rawBody: string) {
  const payload = JSON.parse(rawBody) as MetaWebhookPayload;
  if (payload.object !== "page") return { stored: 0 };
  const sql = getSql();
  let stored = 0;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;
      const leadgenId = typeof change.value?.leadgen_id === "string" ? change.value.leadgen_id : "";
      if (!leadgenId) continue;
      const pageId = typeof change.value?.page_id === "string" ? change.value.page_id : typeof entry.id === "string" ? entry.id : null;
      await sql`
        INSERT INTO meta_lead_webhook_events (event_key, page_id, leadgen_id, payload)
        VALUES (${leadgenId}, ${pageId}, ${leadgenId}, ${rawBody}::jsonb)
        ON CONFLICT (event_key) DO NOTHING
      `;
      stored += 1;
    }
  }
  return { stored };
}
