import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <nav className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span className="text-xl font-bold text-brand-700">Settled</span>
          <div className="flex gap-4">
            <Link
              href="/sign-in"
              className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-slate-900">
          Sell smarter.
          <br />
          <span className="text-brand-600">No upfront fees.</span>
        </h1>
        <p className="mt-6 text-xl text-slate-600">
          Queensland&apos;s licensed property platform. Every stage, every cost, every
          agent action — fully transparent. We take commission only when you sell.
        </p>
        <div className="mt-10 flex justify-center gap-4">
          <Link
            href="/sign-up"
            className="rounded-lg bg-brand-600 px-8 py-3 text-base font-semibold text-white shadow hover:bg-brand-700"
          >
            Start selling
          </Link>
          <Link
            href="/buy"
            className="rounded-lg border border-slate-300 bg-white px-8 py-3 text-base font-semibold text-slate-700 hover:bg-slate-50"
          >
            Browse properties
          </Link>
        </div>
      </section>
    </main>
  );
}
