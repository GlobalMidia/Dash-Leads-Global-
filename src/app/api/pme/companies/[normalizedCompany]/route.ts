import { NextResponse } from "next/server";
import { isDashboardAuthorized } from "@/server/dashboard-auth";
import { getPmeCompanyDetails } from "@/server/pme-repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ normalizedCompany: string }> },
) {
  if (!(await isDashboardAuthorized())) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { normalizedCompany } = await params;
  if (!normalizedCompany || normalizedCompany.length > 300) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  try {
    const company = await getPmeCompanyDetails(normalizedCompany);
    if (!company) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
    return NextResponse.json({ company });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível carregar o histórico da empresa." },
      { status: 503 },
    );
  }
}
