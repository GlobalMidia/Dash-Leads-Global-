import { redirect } from "next/navigation";
import { MetaAdsCenter } from "@/components/meta-ads-center";
import { getDashboardUser } from "@/server/dashboard-auth";
import { isLiveMode } from "@/server/lead-repository";
import { canManageMetaConnection } from "@/server/meta-oauth";
import { getMetaAdsDashboardData } from "@/server/meta-ads-reporting";

export const dynamic = "force-dynamic";

export default async function MetaAdsPage() {
  const user = await getDashboardUser();
  if (!user) redirect("/login");
  return <MetaAdsCenter
    mode={isLiveMode() ? "live" : "demo"}
    user={user}
    initialData={await getMetaAdsDashboardData()}
    canManage={canManageMetaConnection(user.email)}
  />;
}
