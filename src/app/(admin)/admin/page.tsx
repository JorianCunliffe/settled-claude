import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const userType = user.user_metadata["user_type"] as string | undefined;
  if (userType !== "platform_admin") redirect("/");

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Platform Admin</h1>
      <p className="mt-2 text-slate-500">
        Sprint 6 (S6): Workflow builder, agent management, revenue dashboard.
      </p>
    </div>
  );
}
