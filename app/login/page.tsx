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
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left: brand panel */}
      <div className="relative lg:flex-1 overflow-hidden bg-brand-shikho-indigo flex flex-col justify-between p-8 lg:p-12 min-h-[240px] lg:min-h-screen">
        {/* Decorative gradient blobs */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-brand-shikho-pink/30 blur-3xl" />
        <div className="absolute top-1/3 -right-20 w-80 h-80 rounded-full bg-brand-shikho-orange/25 blur-3xl" />
        <div className="absolute -bottom-20 left-1/4 w-80 h-80 rounded-full bg-brand-shikho-blue/40 blur-3xl" />

        {/* Top: logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white p-1.5 shadow-md flex items-center justify-center">
            <Image src="/shikho-logo.png" alt="Shikho" width={40} height={40} className="object-contain" />
          </div>
          <div>
            <div className="text-white font-bold text-lg leading-tight">Shikho</div>
            <div className="text-white/70 text-xs leading-tight">Organic Social Analytics</div>
          </div>
        </div>

        {/* Middle: tagline */}
        <div className="relative z-10 max-w-lg">
          <h1 className="text-white text-3xl lg:text-5xl font-bold leading-tight">
            Know what's <span className="text-brand-shikho-pink">working</span>.<br />
            Know why it's <span className="text-brand-shikho-orange">working</span>.
          </h1>
          <p className="text-white/80 text-sm lg:text-base mt-4 lg:mt-6 leading-relaxed">
            Weekly diagnosis of Shikho's organic Facebook performance — reach, engagement,
            timing, and content patterns — auto-refreshed from the source of truth.
          </p>
        </div>

        {/* Bottom: stats strip */}
        <div className="relative z-10 flex flex-wrap gap-6 lg:gap-10 text-white/90">
          <div>
            <div className="text-2xl lg:text-3xl font-bold">Weekly</div>
            <div className="text-[11px] uppercase tracking-wider text-white/60">Refresh cadence</div>
          </div>
          <div>
            <div className="text-2xl lg:text-3xl font-bold">Facebook</div>
            <div className="text-[11px] uppercase tracking-wider text-white/60">Source platform</div>
          </div>
          <div>
            <div className="text-2xl lg:text-3xl font-bold">0 <span className="text-lg">$/mo</span></div>
            <div className="text-[11px] uppercase tracking-wider text-white/60">Marginal cost</div>
          </div>
        </div>
      </div>

      {/* Right: form */}
      <div className="lg:flex-1 flex items-center justify-center bg-slate-50 px-6 py-10 lg:py-0">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="mb-8">
            <div className="text-slate-900 text-2xl font-bold">Welcome back</div>
            <p className="text-slate-500 text-sm mt-1">
              Enter your team password to access the dashboard.
            </p>
          </div>

          <label className="block text-slate-700 text-sm font-medium mb-2">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-brand-shikho-indigo focus:ring-2 focus:ring-brand-shikho-indigo/10 transition-colors"
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
            className="mt-5 w-full bg-brand-shikho-indigo hover:bg-brand-shikho-blue disabled:bg-slate-300 disabled:text-slate-500 text-white font-semibold py-2.5 rounded-lg transition-colors shadow-sm"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <div className="mt-8 pt-6 border-t border-slate-200 text-xs text-slate-400">
            Internal tool. Access limited to the Shikho social team.
          </div>
        </form>
      </div>
    </div>
  );
}
