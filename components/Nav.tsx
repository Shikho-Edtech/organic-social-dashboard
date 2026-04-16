"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Overview" },
  { href: "/trends", label: "Trends" },
  { href: "/engagement", label: "Engagement" },
  { href: "/timing", label: "Timing" },
  { href: "/strategy", label: "Strategy" },
  { href: "/plan", label: "Plan" },
  { href: "/explore", label: "Explore" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm">
                S
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold text-slate-900">Shikho</div>
                <div className="text-[10px] text-slate-500 -mt-0.5">Organic Social</div>
              </div>
            </Link>
            <span className="ml-2 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[11px] font-semibold">
              Facebook Page
            </span>
          </div>
          <button
            onClick={() =>
              fetch("/api/auth", { method: "DELETE" }).then(
                () => (window.location.href = "/login")
              )
            }
            className="text-xs text-slate-500 hover:text-slate-800"
          >
            Sign out
          </button>
        </div>
        <nav className="flex items-center gap-1 -mb-px overflow-x-auto">
          {TABS.map((t) => {
            const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  active
                    ? "border-slate-900 text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
