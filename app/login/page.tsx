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
          <div className="w-14 h-14 rounded-xl bg-white shadow-md flex items-center justify-center overflow-hidden">
            <Image src="/shikho-bird.png" alt="Shikho" width={48} height={48} className="object-contain" />
          </div>
          <div>
            <div className="text-white font-bold text-lg leading-tight">Shikho</div>
            <div className="text-white/70 text-xs leading-tight tracking-wide">Organic Social Intelligence</div>
          </div>
        </div>

        {/* Middle: tagline + workflow cadence */}
        <div className="relative z-10 max-w-lg">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-shikho-pink mb-3">
            Facebook performance, diagnosed weekly
          </div>
          <h1 className="text-white text-3xl lg:text-[44px] font-bold leading-[1.05] tracking-tight">
            Every post, <span className="text-brand-shikho-pink">measured</span>.<br />
            Every pattern, <span className="text-brand-shikho-orange">surfaced</span>.
          </h1>
          <p className="text-white/75 text-sm lg:text-base mt-5 leading-relaxed">
            A living diagnosis of Shikho&apos;s organic Facebook presence.
            Reach, engagement, timing, content format, and reel retention,
            refreshed on a predictable cadence.
          </p>

          {/* Data flow illustration — replaces the earlier bullet-list cadence
              block. Three-stop pipeline (Source → Store → Surface) with the
              two refresh cadences labelled on the arrows, so the reader can
              see *how* the data gets here at a glance instead of parsing
              four parallel bullets. Kept to a single horizontal row on lg+
              and a compact vertical stack on mobile. */}
          <div className="mt-6 lg:mt-8">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50 mb-3">
              How the data gets here
            </div>
            <div className="flex flex-col lg:flex-row lg:items-stretch gap-3 lg:gap-0">
              {/* Stop 1: Meta Graph API */}
              <div className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 lg:rounded-r-none backdrop-blur-sm">
                <div className="flex items-center gap-2 text-brand-shikho-pink text-[11px] font-semibold uppercase tracking-wider">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round" />
                  </svg>
                  Source
                </div>
                <div className="text-white text-sm font-semibold mt-1">Meta Graph API v21.0</div>
                <div className="text-white/60 text-xs mt-0.5 leading-snug">Posts, page metrics, reel retention</div>
              </div>

              {/* Arrow 1: daily cadence */}
              <div className="flex lg:flex-col items-center justify-center px-3 lg:px-2 text-white/50">
                <div className="flex flex-col items-center">
                  <div className="text-[10px] font-semibold tracking-widest uppercase text-brand-shikho-pink whitespace-nowrap">Daily 09:00</div>
                  <svg className="w-8 h-4 lg:w-6 lg:h-5 rotate-90 lg:rotate-0 mt-0.5" viewBox="0 0 24 8" fill="none" aria-hidden="true">
                    <path d="M0 4h22M18 1l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>

              {/* Stop 2: Google Sheets */}
              <div className="flex-1 bg-white/5 border border-white/10 rounded-lg lg:rounded-none px-4 py-3 backdrop-blur-sm">
                <div className="flex items-center gap-2 text-brand-shikho-orange text-[11px] font-semibold uppercase tracking-wider">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
                  </svg>
                  Store
                </div>
                <div className="text-white text-sm font-semibold mt-1">Google Sheets</div>
                <div className="text-white/60 text-xs mt-0.5 leading-snug">Raw tables + Claude-written verdicts</div>
              </div>

              {/* Arrow 2: weekly diagnosis */}
              <div className="flex lg:flex-col items-center justify-center px-3 lg:px-2 text-white/50">
                <div className="flex flex-col items-center">
                  <div className="text-[10px] font-semibold tracking-widest uppercase text-brand-shikho-orange whitespace-nowrap">Mon 10:00</div>
                  <svg className="w-8 h-4 lg:w-6 lg:h-5 rotate-90 lg:rotate-0 mt-0.5" viewBox="0 0 24 8" fill="none" aria-hidden="true">
                    <path d="M0 4h22M18 1l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>

              {/* Stop 3: Dashboard */}
              <div className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 lg:rounded-l-none backdrop-blur-sm">
                <div className="flex items-center gap-2 text-brand-shikho-blue text-[11px] font-semibold uppercase tracking-wider">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="14" rx="2" />
                    <path d="M3 21h18M8 13V9M12 13V6M16 13v-3" strokeLinecap="round" />
                  </svg>
                  Surface
                </div>
                <div className="text-white text-sm font-semibold mt-1">This dashboard</div>
                <div className="text-white/60 text-xs mt-0.5 leading-snug">5-min cache · hard-refresh to re-read</div>
              </div>
            </div>

            <p className="text-white/55 text-xs mt-3 leading-snug">
              Daily raw refresh keeps KPIs current; Monday diagnosis regenerates Strategy &amp; Plan.
            </p>
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
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-shikho-indigo mb-2">Team access</div>
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

          <div className="mt-8 pt-6 border-t border-slate-200 space-y-2 text-xs text-slate-500 leading-relaxed">
            <div>
              <span className="font-semibold text-slate-700">What lives here:</span> Overview, Trends, Engagement, Timing, Reels, Strategy, Plan, Explore.
            </div>
            <div>
              <span className="font-semibold text-slate-700">Times:</span> Bangladesh Time (UTC+6) throughout.
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
