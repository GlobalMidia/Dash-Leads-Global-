import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import {
  isLiveMode,
  isPublicPrototypeMode,
} from "@/server/lead-repository";
import { getSql } from "@/server/db";
import { getNeonAuth, isNeonAuthConfigured } from "@/server/neon-auth";

const COOKIE_NAME = "global_dashboard_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 12;

export type DashboardUser = {
  id?: string;
  authUserId?: string;
  email: string;
  name: string;
  initials: string;
};

const DEMO_USER: DashboardUser = {
  email: "marina@globalmidia.digital",
  name: "Marina Costa",
  initials: "MC",
};

function makeInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "GM"
  );
}

function isCorporateEmail(email: string) {
  return email.trim().toLowerCase().endsWith("@globalmidia.digital");
}

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
  if (isNeonAuthConfigured()) return true;
  const { password, secret } = credentials();
  return Boolean(password || secret || isLiveMode());
}

export function authIsConfigured() {
  if (isPublicPrototypeMode()) return false;
  if (isNeonAuthConfigured()) return true;
  const { password, secret } = credentials();
  return Boolean(password && secret);
}

export function isIndividualAuthEnabled() {
  return !isPublicPrototypeMode() && isNeonAuthConfigured();
}

async function getIndividualDashboardUser(): Promise<DashboardUser | null> {
  const { data } = await getNeonAuth().getSession();
  const user = data?.user;
  const email = user?.email?.trim().toLowerCase();
  if (!user || !email || !isCorporateEmail(email)) return null;

  const name = user.name?.trim() || email.split("@")[0];
  const dashboardUser: DashboardUser = {
    authUserId: user.id,
    email,
    name,
    initials: makeInitials(name),
  };

  if (!isLiveMode()) return dashboardUser;

  const sql = getSql();
  const rows = (await sql`
    INSERT INTO application_users (auth_user_id, email, name, last_login_at)
    VALUES (${user.id}, ${email}, ${name}, NOW())
    ON CONFLICT (auth_user_id)
    DO UPDATE SET
      email = EXCLUDED.email,
      name = EXCLUDED.name,
      last_login_at = EXCLUDED.last_login_at
    RETURNING id::text
  `) as Array<{ id: string }>;

  return { ...dashboardUser, id: rows[0]?.id };
}

export async function getDashboardUser(): Promise<DashboardUser | null> {
  if (isPublicPrototypeMode() || !authIsRequired()) return DEMO_USER;
  if (isIndividualAuthEnabled()) return getIndividualDashboardUser();

  return (await getSharedPasswordAuthorization()) ? DEMO_USER : null;
}

export async function isDashboardAuthorized() {
  return Boolean(await getDashboardUser());
}

async function getSharedPasswordAuthorization() {
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
