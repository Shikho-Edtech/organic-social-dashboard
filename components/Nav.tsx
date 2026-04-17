"use client";
import Link from "next/link";
import Image from "next/image";
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
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 p-1 flex items-center justify-center">
                <Image src="/shikho-logo.png" alt="Shikho" width={28} height={28} className="object-contain" />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold text-brand-shikho-indigo">Shikho</div>
                <div className="text-[10px] text-slate-500 -mt-0.5">Organic Social</div>
              </div>
            </Link>
            <span className="ml-2 px-2 py-0.5 rounded-md bg-brand-shikho-indigo/10 text-brand-shikho-indigo text-[11px] font-semibold">
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
