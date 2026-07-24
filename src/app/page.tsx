import { redirect } from "next/navigation";
import { LeadDashboard } from "@/components/lead-dashboard";
import {
  getDashboardUser,
  isIndividualAuthEnabled,
} from "@/server/dashboard-auth";
import { isLiveMode, listLeads } from "@/server/lead-repository";
import { isRdConfigured } from "@/server/rd-client";
import { isRdConnected } from "@/server/rd-oauth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getDashboardUser();
  if (!user) redirect("/login");

  const liveMode = isLiveMode();
  const rdConfigured = liveMode && isRdConfigured();

  return (
    <LeadDashboard
      initialLeads={await listLeads()}
      mode={liveMode ? "live" : "demo"}
      rdConfigured={rdConfigured}
      rdConnected={rdConfigured && (await isRdConnected())}
      neonAuthEnabled={isIndividualAuthEnabled()}
      user={user}
    />
  );
}
