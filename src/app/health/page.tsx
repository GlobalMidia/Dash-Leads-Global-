import { redirect } from "next/navigation";
import { HealthCenter } from "@/components/health-center";
import { getDashboardUser } from "@/server/dashboard-auth";
import { listClientAccounts } from "@/server/client-health-repository";
import { isLiveMode } from "@/server/lead-repository";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const user = await getDashboardUser();
  if (!user) redirect("/login");
  return <HealthCenter initialAccounts={await listClientAccounts("all")} initialNow={new Date().toISOString()} mode={isLiveMode() ? "live" : "demo"} user={user} />;
}
