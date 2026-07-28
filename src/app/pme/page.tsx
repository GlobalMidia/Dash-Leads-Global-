import { redirect } from "next/navigation";
import { PmeReactivationDirectory } from "@/components/pme-reactivation-directory";
import { getDashboardUser } from "@/server/dashboard-auth";
import { isLiveMode } from "@/server/lead-repository";

export const dynamic = "force-dynamic";

export default async function PmePage() {
  const user = await getDashboardUser();
  if (!user) redirect("/login");

  return (
    <PmeReactivationDirectory
      mode={isLiveMode() ? "live" : "demo"}
      user={user}
    />
  );
}
