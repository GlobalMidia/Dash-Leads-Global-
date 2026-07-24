import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import {
  isLiveMode,
  isPublicPrototypeMode,
} from "@/server/lead-repository";

const COOKIE_NAME = "global_dashboard_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 12;

function credentials() {
  return {
    password: process.env.DASHBOARD_PASSWORD,
    secret: process.env.DASHBOARD_SESSION_SECRET,
  };
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function signature(expiresAt: string, secret: string) {
  return createHmac("sha256", secret).update(expiresAt).digest("hex");
}

export function authIsRequired() {
  if (isPublicPrototypeMode()) return false;
  const { password, secret } = credentials();
  return Boolean(password || secret || isLiveMode());
}

export function authIsConfigured() {
  if (isPublicPrototypeMode()) return false;
  const { password, secret } = credentials();
  return Boolean(password && secret);
}

export async function isDashboardAuthorized() {
  if (!authIsRequired()) return true;
  const { secret } = credentials();
  if (!secret) return false;

  const value = (await cookies()).get(COOKIE_NAME)?.value;
  if (!value) return false;

  const [expiresAt, receivedSignature] = value.split(".");
  if (!expiresAt || !receivedSignature || Number(expiresAt) <= Date.now()) {
    return false;
  }

  return safeEqual(receivedSignature, signature(expiresAt, secret));
}

export function verifyPassword(candidate: string) {
  const { password } = credentials();
  return Boolean(password && safeEqual(candidate, password));
}

export async function createDashboardSession() {
  const { secret } = credentials();
  if (!secret) throw new Error("DASHBOARD_SESSION_SECRET não configurado.");

  const expiresAt = String(Date.now() + SESSION_DURATION_SECONDS * 1000);
  const cookieStore = await cookies();
  cookieStore.set(
    COOKIE_NAME,
    `${expiresAt}.${signature(expiresAt, secret)}`,
    {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_DURATION_SECONDS,
      path: "/",
    },
  );
}

export async function destroyDashboardSession() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
    path: "/",
  });
}
