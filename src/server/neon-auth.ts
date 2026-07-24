import "server-only";

import { createNeonAuth } from "@neondatabase/auth/next/server";

type NeonAuth = ReturnType<typeof createNeonAuth>;

let neonAuth: NeonAuth | null = null;

export function isNeonAuthConfigured() {
  return Boolean(
    process.env.DATABASE_NEON_AUTH_BASE_URL &&
      process.env.NEON_AUTH_COOKIE_SECRET,
  );
}

export function getNeonAuth() {
  if (neonAuth) return neonAuth;

  const baseUrl = process.env.DATABASE_NEON_AUTH_BASE_URL;
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl || !secret) {
    throw new Error("A autenticação individual ainda não foi configurada.");
  }

  neonAuth = createNeonAuth({
    baseUrl,
    cookies: { secret },
  });
  return neonAuth;
}
