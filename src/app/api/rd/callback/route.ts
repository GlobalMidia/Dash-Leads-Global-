import { NextResponse } from "next/server";
import { exchangeAuthorizationCode, isValidState, storeRdTokens } from "@/server/rd-oauth";
import { configureRdConversionWebhook } from "@/server/rd-client";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = request.headers.get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("rd_oauth_state="))
    ?.slice("rd_oauth_state=".length);

  const redirect = new URL("/", request.url);
  const clearCookie = (response: NextResponse) => {
    response.cookies.set("rd_oauth_state", "", { path: "/api/rd/callback", maxAge: 0 });
    return response;
  };

  if (error || !code || !isValidState(state, expectedState)) {
    redirect.searchParams.set("rd", "error");
    return clearCookie(NextResponse.redirect(redirect));
  }

  try {
    await storeRdTokens(await exchangeAuthorizationCode(code));
    try {
      await configureRdConversionWebhook(url.origin);
    } catch (webhookError) {
      console.error("Falha ao configurar o webhook automático do RD Station:", webhookError);
    }
    redirect.searchParams.set("rd", "connected");
    return clearCookie(NextResponse.redirect(redirect));
  } catch {
    redirect.searchParams.set("rd", "error");
    return clearCookie(NextResponse.redirect(redirect));
  }
}
