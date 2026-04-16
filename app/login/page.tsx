"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
    <div className="min-h-screen flex items-center justify-center bg-ink-900 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-ink-800 rounded-xl p-8 border border-ink-700"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent-cyan to-accent-blue flex items-center justify-center font-bold text-white">
            S
          </div>
          <div>
            <div className="text-slate-100 font-semibold">Shikho</div>
            <div className="text-slate-500 text-sm">Organic Social Analytics</div>
          </div>
        </div>
        <label className="block text-slate-400 text-sm mb-2">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-2.5 bg-ink-900 border border-ink-700 rounded-lg text-slate-100 focus:outline-none focus:border-accent-cyan"
          placeholder="Enter password"
          autoFocus
        />
        {error && <div className="mt-3 text-accent-red text-sm">{error}</div>}
        <button
          type="submit"
          disabled={loading || !password}
          className="mt-5 w-full bg-accent-cyan hover:bg-cyan-600 disabled:bg-ink-700 disabled:text-slate-500 text-white font-medium py-2.5 rounded-lg transition-colors"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
