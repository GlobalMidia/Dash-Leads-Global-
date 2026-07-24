import { redirect } from "next/navigation";
import { LeadDashboard } from "@/components/lead-dashboard";
import { isDashboardAuthorized } from "@/server/dashboard-auth";
import { isLiveMode, listLeads } from "@/server/lead-repository";
import { isRdConfigured } from "@/server/rd-client";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await isDashboardAuthorized())) redirect("/login");

  return (
    <LeadDashboard
      initialLeads={await listLeads()}
      mode={isLiveMode() ? "live" : "demo"}
      rdConfigured={isLiveMode() && isRdConfigured()}
    />
  );
}
