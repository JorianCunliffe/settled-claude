import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function OrgPortalPage({
  params,
}: {
  params: { orgSlug: string };
}) {
  const org = await prisma.organisation.findUnique({
    where: { slug: params.orgSlug },
  });

  if (!org) notFound();

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div>
            <span className="text-sm text-slate-400">In partnership with</span>
            <h1 className="text-lg font-bold text-slate-900">{org.name}</h1>
          </div>
          <span className="text-lg font-bold text-brand-700">Settled</span>
        </div>
      </nav>

      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h2 className="text-3xl font-bold text-slate-900">
          Free property search for {org.name} members
        </h2>
        <p className="mt-4 text-slate-600">
          As a member, you get free access to off-market properties before they hit Domain
          and REA. Create your buyer profile and start matching.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href={`/sign-up?orgSlug=${org.slug}&userType=buyer`}
            className="rounded-lg bg-brand-600 px-8 py-3 text-base font-semibold text-white hover:bg-brand-700"
          >
            Create free account
          </Link>
          <Link
            href="/sign-in"
            className="rounded-lg border border-slate-300 bg-white px-8 py-3 text-base font-semibold text-slate-700 hover:bg-slate-50"
          >
            Sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
