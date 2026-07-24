import { getNeonAuth } from "@/server/neon-auth";

type AuthContext = { params: Promise<{ path: string[] }> };

function handler() {
  return getNeonAuth().handler();
}

export async function GET(request: Request, context: AuthContext) {
  return handler().GET(request, context);
}

export async function POST(request: Request, context: AuthContext) {
  return handler().POST(request, context);
}

export async function PUT(request: Request, context: AuthContext) {
  return handler().PUT(request, context);
}

export async function PATCH(request: Request, context: AuthContext) {
  return handler().PATCH(request, context);
}

export async function DELETE(request: Request, context: AuthContext) {
  return handler().DELETE(request, context);
}
