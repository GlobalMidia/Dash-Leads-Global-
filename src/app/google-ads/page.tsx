import { redirect } from "next/navigation";
import { GoogleAdsCenter } from "@/components/google-ads-center";
import { getDashboardUser } from "@/server/dashboard-auth";
import { getGoogleAdsDashboardData } from "@/server/google-ads-reporting";

export const dynamic = "force-dynamic";

export default async function GoogleAdsPage() {
  const user = await getDashboardUser();
  if (!user) redirect("/login");
  return <GoogleAdsCenter user={user} initialData={await getGoogleAdsDashboardData()} />;
}
