import { NextResponse } from "next/server";
import { getDashboardUser } from "@/server/dashboard-auth";
import { exchangeAuthorizationCode, isValidState, storeGa4Tokens } from "@/server/ga4-oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const response = new URL("/ga4", request.url);
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("ga4_oauth_state="))?.slice("ga4_oauth_state=".length);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const clear = (result: NextResponse) => { result.cookies.set("ga4_oauth_state", "", { path: "/api/ga4/callback", maxAge: 0 }); return result; };
  if (url.searchParams.get("error") || !code || !isValidState(state, cookie)) { response.searchParams.set("ga4", "error"); return clear(NextResponse.redirect(response)); }
  try {
    const user = await getDashboardUser();
    await storeGa4Tokens(await exchangeAuthorizationCode(code, url.origin), user?.email ?? null);
    response.searchParams.set("ga4", "connected");
    return clear(NextResponse.redirect(response));
  } catch (error) {
    console.error("Falha na conexão OAuth do GA4:", error);
    response.searchParams.set("ga4", "error");
    return clear(NextResponse.redirect(response));
  }
}
