import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AgentPortalPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Agent Portal</h1>
      <p className="mt-2 text-slate-500">
        Sprint 2 (S2-007): Full agent workload view — action queue, assigned properties,
        portfolio financials.
      </p>
    </div>
  );
}
