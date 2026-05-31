import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export default async function SellerDashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const properties = await prisma.property.findMany({
    where: { sellerId: user.id },
    include: { propertyWorkflow: { include: { workflowDefinition: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/" className="text-xl font-bold text-brand-700">Settled</Link>
          <span className="text-sm text-slate-500">Seller dashboard</span>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">Your properties</h1>
          <Link
            href="/sell/onboarding"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            + List a property
          </Link>
        </div>

        {properties.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="text-slate-500">No properties yet.</p>
            <Link
              href="/sell/onboarding"
              className="mt-4 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              List your first property
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {properties.map((property) => (
              <div
                key={property.id}
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-semibold text-slate-900">
                      {property.addressLine}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {property.suburb} {property.state} {property.postcode}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium capitalize text-slate-600">
                    {property.status.replace("_", " ")}
                  </span>
                </div>
                <div className="mt-4 flex items-center gap-4">
                  <span className="text-sm text-slate-500">
                    Stage {property.currentStage} ·{" "}
                    {property.propertyWorkflow?.currentStageKey ?? "—"}
                  </span>
                  <Link
                    href={`/sell/${property.id}`}
                    className="text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    View workflow →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
