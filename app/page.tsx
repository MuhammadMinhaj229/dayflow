import { redirect } from "next/navigation";
import TodayDashboard from "@/components/today-dashboard";
import { getSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";
export default async function HomePage() {
  const session = await getSession();
  if (!session && !isDemoMode) redirect("/login");
  return <TodayDashboard demoMode={isDemoMode} email={session?.email ?? "demo@dayflow.local"}/>;
}
