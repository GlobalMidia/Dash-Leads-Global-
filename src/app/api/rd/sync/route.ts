import { NextResponse } from "next/server";
import { isDashboardAuthorized } from "@/server/dashboard-auth";
import { isLiveMode, upsertLeads } from "@/server/lead-repository";
import { importAllRdContacts, isRdConfigured } from "@/server/rd-client";

export async function POST() {
  if (!(await isDashboardAuthorized())) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!isLiveMode() || !isRdConfigured()) {
    return NextResponse.json(
      {
        error:
          "Configure o banco e as credenciais OAuth do RD Station para sincronizar.",
      },
      { status: 503 },
    );
  }

  try {
    const contacts = await importAllRdContacts();
    const imported = await upsertLeads(contacts);
    return NextResponse.json({ imported });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível sincronizar com o RD Station.",
      },
      { status: 502 },
    );
  }
}
