"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.push(params.get("next") || "/");
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Login failed");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50">
      {/* Left: brand panel */}
      <div className="relative lg:flex-1 overflow-hidden bg-brand-shikho-indigo flex flex-col justify-between p-8 lg:p-12 min-h-[240px] lg:min-h-screen">
        {/* Decorative gradient blobs — subtle */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-brand-shikho-pink/25 blur-3xl" />
        <div className="absolute top-1/3 -right-20 w-80 h-80 rounded-full bg-brand-shikho-orange/20 blur-3xl" />
        <div className="absolute -bottom-20 left-1/4 w-80 h-80 rounded-full bg-brand-shikho-blue/30 blur-3xl" />

        {/* Top: logo + wordmark */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white p-1.5 shadow-md flex items-center justify-center">
            <Image src="/shikho-logo.png" alt="Shikho" width={40} height={40} className="object-contain" />
          </div>
          <div>
            <div className="text-white font-bold text-lg leading-tight">Shikho</div>
            <div className="text-white/70 text-xs leading-tight">Organic Social Intelligence</div>
          </div>
        </div>

        {/* Middle: tagline + workflow cadence */}
        <div className="relative z-10 max-w-lg">
          <h1 className="text-white text-3xl lg:text-5xl font-bold leading-tight tracking-tight">
            Know what&apos;s <span className="text-brand-shikho-pink">working</span>.<br />
            Know why it&apos;s <span className="text-brand-shikho-orange">working</span>.
          </h1>
          <p className="text-white/75 text-sm lg:text-base mt-4 lg:mt-6 leading-relaxed">
            A living diagnosis of Shikho&apos;s organic Facebook performance. Reach,
            engagement, timing, content patterns, and reel retention, refreshed on
            a predictable cadence.
          </p>

          {/* Workflow cadence bullets */}
          <div className="mt-6 lg:mt-8 space-y-3">
            <div className="flex items-start gap-3">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-shikho-pink shrink-0" />
              <div>
                <div className="text-white text-sm font-semibold">Daily 09:00 BDT</div>
                <div className="text-white/65 text-xs leading-snug">Raw posts, page metrics, reel data refreshed. Dashboard charts reflect yesterday.</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-shikho-orange shrink-0" />
              <div>
                <div className="text-white text-sm font-semibold">Monday 10:00 BDT</div>
                <div className="text-white/65 text-xs leading-snug">Full weekly diagnosis by Claude Sonnet. Strategy verdict and Plan calendar repopulate.</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-shikho-blue shrink-0" />
              <div>
                <div className="text-white text-sm font-semibold">Source of truth</div>
                <div className="text-white/65 text-xs leading-snug">Meta Graph API v21.0 directly to Google Sheets. No manual exports, no third party intermediate.</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-white/60 shrink-0" />
              <div>
                <div className="text-white text-sm font-semibold">Cache freshness</div>
                <div className="text-white/65 text-xs leading-snug">5 minute server cache. Hard refresh to force a re-read from Sheets.</div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: attribution */}
        <div className="relative z-10 text-white/55 text-xs leading-snug">
          <div className="font-semibold text-white/85">Prepared by Shahriar</div>
          <div>Performance &amp; Growth Marketing</div>
        </div>
      </div>

      {/* Right: form */}
      <div className="lg:flex-1 flex items-center justify-center px-6 py-10 lg:py-0">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="mb-8">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-shikho-indigo mb-2">Team access</div>
            <div className="text-slate-900 text-2xl font-bold leading-tight">Sign in to the dashboard</div>
            <p className="text-slate-500 text-sm mt-2 leading-relaxed">
              Internal tool for the Shikho social team. Enter the shared team password to continue.
            </p>
          </div>

          <label className="block text-slate-700 text-xs font-semibold uppercase tracking-wider mb-2">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-brand-shikho-indigo focus:ring-2 focus:ring-brand-shikho-indigo/15 transition-colors"
            placeholder="••••••••"
            autoFocus
          />
          {error && (
            <div className="mt-3 px-3 py-2 rounded-md bg-red-50 border border-red-100 text-red-700 text-sm">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            className="mt-5 w-full bg-brand-shikho-indigo hover:bg-brand-shikho-blue disabled:bg-slate-300 disabled:text-slate-500 text-white font-semibold py-3 rounded-lg transition-colors shadow-sm"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <div className="mt-8 pt-6 border-t border-slate-200 space-y-2 text-xs text-slate-400 leading-relaxed">
            <div>
              <span className="font-semibold text-slate-500">What lives here:</span> Overview, Trends, Engagement, Timing, Reels, Strategy, Plan, Explore.
            </div>
            <div>
              <span className="font-semibold text-slate-500">Times:</span> Bangladesh Time (UTC+6) throughout.
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
