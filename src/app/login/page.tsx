import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import {
  authIsConfigured,
  isIndividualAuthEnabled,
  isDashboardAuthorized,
} from "@/server/dashboard-auth";

export const metadata = { title: "Acesso | Dashboard de Leads" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const preview = (await searchParams).preview === "1";
  if (!preview && (await isDashboardAuthorized())) redirect("/");
  return (
    <LoginForm
      configured={authIsConfigured()}
      individualAuthEnabled={isIndividualAuthEnabled()}
      preview={preview}
    />
  );
}
