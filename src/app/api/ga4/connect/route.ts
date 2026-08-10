import { NextResponse } from "next/server";
import { isDashboardAuthorized } from "@/server/dashboard-auth";
import { authorizationUrl, createState, isGa4OAuthConfigured } from "@/server/ga4-oauth";

export async function GET(request: Request) {
  if (!(await isDashboardAuthorized())) return NextResponse.redirect(new URL("/login", request.url));
  if (!isGa4OAuthConfigured()) return NextResponse.json({ error: "Configure GA4_CLIENT_ID e GA4_CLIENT_SECRET na Vercel." }, { status: 503 });
  try {
    const state = createState();
    const response = NextResponse.redirect(authorizationUrl(new URL(request.url).origin, state));
    response.cookies.set("ga4_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/api/ga4/callback" });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível iniciar a conexão do GA4." }, { status: 503 });
  }
}
