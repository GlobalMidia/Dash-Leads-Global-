import { redirect } from "next/navigation";
import { Ga4Center } from "@/components/ga4-center";
import { getDashboardUser } from "@/server/dashboard-auth";
import { getGa4Properties } from "@/server/ga4-reporting";

export const dynamic = "force-dynamic";

export default async function Ga4Page() {
  const user = await getDashboardUser();
  if (!user) redirect("/login");
  return <Ga4Center user={user} initial={await getGa4Properties()} />;
}
