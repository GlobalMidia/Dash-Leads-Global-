import { NextResponse } from "next/server";
import { getDashboardUser } from "@/server/dashboard-auth";
import {
  authorizationUrl,
  canManageMetaConnection,
  createMetaConnectionActor,
  createState,
  isMetaOAuthConfigured,
} from "@/server/meta-oauth";

export async function GET(request: Request) {
  const user = await getDashboardUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!canManageMetaConnection(user.email)) {
    return NextResponse.json({ error: "A conexão corporativa do Meta Ads só pode ser renovada pela conta designada." }, { status: 403 });
  }
  if (!isMetaOAuthConfigured()) {
    return NextResponse.json({ error: "As credenciais corporativas do Meta Ads ainda não foram configuradas na Vercel." }, { status: 503 });
  }

  try {
    const state = createState();
    const response = NextResponse.redirect(authorizationUrl(new URL(request.url).origin, state));
    response.cookies.set("meta_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 10,
      path: "/api/meta/callback",
    });
    response.cookies.set("meta_oauth_actor", createMetaConnectionActor(state, user.email), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 10,
      path: "/api/meta/callback",
    });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível iniciar a conexão com o Meta Ads." }, { status: 503 });
  }
}
