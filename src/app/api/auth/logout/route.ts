import { NextResponse } from "next/server";
import { destroyDashboardSession } from "@/server/dashboard-auth";

export async function POST(request: Request) {
  await destroyDashboardSession();
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
