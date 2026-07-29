import { NextResponse } from "next/server";
import { getDashboardUser } from "@/server/dashboard-auth";
import {
  canManageMetaConnection,
  exchangeAuthorizationCode,
  isValidState,
  loadMetaAdAccounts,
  storeMetaConnection,
} from "@/server/meta-oauth";

function cookieValue(request: Request, name: string) {
  return request.headers.get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirect = new URL("/", request.url);
  const clearCookie = (response: NextResponse) => {
    response.cookies.set("meta_oauth_state", "", { path: "/api/meta/callback", maxAge: 0 });
    return response;
  };
  const user = await getDashboardUser();
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");

  if (!user || !canManageMetaConnection(user.email) || denied || !code || !isValidState(state, cookieValue(request, "meta_oauth_state"))) {
    redirect.searchParams.set("meta", "error");
    return clearCookie(NextResponse.redirect(redirect));
  }

  try {
    const tokens = await exchangeAuthorizationCode(code, url.origin);
    const data = await loadMetaAdAccounts(tokens.accessToken);
    await storeMetaConnection({ ...tokens, ...data, connectedByEmail: user.email });
    redirect.searchParams.set("meta", "connected");
    return clearCookie(NextResponse.redirect(redirect));
  } catch (error) {
    console.error("Falha ao conectar Meta Ads:", error);
    redirect.searchParams.set("meta", "error");
    return clearCookie(NextResponse.redirect(redirect));
  }
}
