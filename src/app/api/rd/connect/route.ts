import { NextResponse } from "next/server";
import { isDashboardAuthorized } from "@/server/dashboard-auth";
import { authorizationUrl, createState } from "@/server/rd-oauth";

export async function GET(request: Request) {
  if (!(await isDashboardAuthorized())) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const state = createState();
    const response = NextResponse.redirect(authorizationUrl(new URL(request.url).origin, state));
    response.cookies.set("rd_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 10,
      path: "/api/rd/callback",
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "NÃ£o foi possÃ­vel iniciar a conexÃ£o com o RD Station." },
      { status: 503 },
    );
  }
}
