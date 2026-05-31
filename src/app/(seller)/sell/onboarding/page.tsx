"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SellerOnboardingPage() {
  const router = useRouter();

  const [step, setStep] = useState<"address" | "form6" | "finance">("address");
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [envelopeId, setEnvelopeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    addressLine: "",
    suburb: "",
    state: "QLD",
    postcode: "",
    propertyType: "residential" as "residential" | "residential_auction",
    bedrooms: "",
    bathrooms: "",
  });

  async function handleCreateProperty(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/properties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        bedrooms: form.bedrooms ? parseInt(form.bedrooms) : undefined,
        bathrooms: form.bathrooms ? parseInt(form.bathrooms) : undefined,
      }),
    });

    const json = await res.json() as { data?: { propertyId: string }; error?: string };

    if (!res.ok || json.error) {
      setError(json.error ?? "Something went wrong");
      setLoading(false);
      return;
    }

    setPropertyId(json.data!.propertyId);
    setStep("form6");
    setLoading(false);
  }

  async function handleSendForm6() {
    if (!propertyId) return;
    setError(null);
    setLoading(true);

    const res = await fetch(`/api/properties/${propertyId}/form6/send`, {
      method: "POST",
    });

    const json = await res.json() as { data?: { envelopeId: string }; error?: string };

    if (!res.ok || json.error) {
      setError(json.error ?? "Something went wrong");
      setLoading(false);
      return;
    }

    setEnvelopeId(json.data!.envelopeId);
    setStep("finance");
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" className="text-xl font-bold text-brand-700">Settled</Link>
          <Link href="/sell" className="text-sm text-slate-500 hover:text-slate-700">
            ← Back to dashboard
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-xl px-6 py-12">
        {/* Step indicator */}
        <div className="mb-8 flex gap-2">
          {["address", "form6", "finance"].map((s, i) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full ${
                i <= ["address", "form6", "finance"].indexOf(step)
                  ? "bg-brand-600"
                  : "bg-slate-200"
              }`}
            />
          ))}
        </div>

        {step === "address" && (
          <>
            <h1 className="mb-2 text-2xl font-semibold text-slate-900">
              Tell us about your property
            </h1>
            <p className="mb-8 text-slate-500">
              We&apos;ll use this to match you with the right agent and workflow.
            </p>
            <form onSubmit={handleCreateProperty} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Street address</label>
                <input
                  required
                  value={form.addressLine}
                  onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="123 Main Street"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Suburb</label>
                  <input
                    required
                    value={form.suburb}
                    onChange={(e) => setForm({ ...form, suburb: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="Paddington"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Postcode</label>
                  <input
                    required
                    value={form.postcode}
                    onChange={(e) => setForm({ ...form, postcode: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="4064"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Sale type</label>
                <select
                  value={form.propertyType}
                  onChange={(e) => setForm({ ...form, propertyType: e.target.value as "residential" | "residential_auction" })}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="residential">Private treaty (standard)</option>
                  <option value="residential_auction">Auction campaign</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Bedrooms</label>
                  <input
                    type="number"
                    min="1"
                    value={form.bedrooms}
                    onChange={(e) => setForm({ ...form, bedrooms: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Bathrooms</label>
                  <input
                    type="number"
                    min="1"
                    value={form.bathrooms}
                    onChange={(e) => setForm({ ...form, bathrooms: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>
              {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {loading ? "Creating…" : "Continue"}
              </button>
            </form>
          </>
        )}

        {step === "form6" && (
          <>
            <h1 className="mb-2 text-2xl font-semibold text-slate-900">
              Sign your Form 6
            </h1>
            <p className="mb-6 text-slate-500">
              The Form 6 is the Queensland Appointment of Agent — it authorises Settled
              to act as your agent under the platform&apos;s principal licence. You&apos;ll
              sign it electronically via DocuSign.
            </p>
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <h2 className="font-semibold text-slate-900">What you&apos;re signing</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>✓ Appointment of Agent (Settled platform)</li>
                <li>✓ Commission: 2.5% inc GST (taken from sale proceeds, no upfront fee)</li>
                <li>✓ Exclusive term: 3 months, rolling</li>
                <li>✓ QLD Real Property Act compliant</li>
              </ul>
            </div>
            {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button
              onClick={handleSendForm6}
              disabled={loading}
              className="mt-6 w-full rounded-md bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send Form 6 to my email"}
            </button>
          </>
        )}

        {step === "finance" && (
          <>
            <h1 className="mb-2 text-2xl font-semibold text-slate-900">
              Pre-sale finance
            </h1>
            <p className="mb-6 text-slate-500">
              Your Form 6 has been sent (envelope: {envelopeId}). While you wait, apply
              for your pre-sale finance facility to fund improvements, photography, and
              marketing — repaid from sale proceeds at settlement.
            </p>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Finance application coming in Sprint 3 (ListReady integration). For now,
              your workflow has been initialised and you can track progress from your dashboard.
            </div>
            <button
              onClick={() => router.push("/sell")}
              className="mt-6 w-full rounded-md bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Go to my dashboard
            </button>
          </>
        )}
      </main>
    </div>
  );
}
