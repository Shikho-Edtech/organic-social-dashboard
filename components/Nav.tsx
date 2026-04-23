"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";

const TABS = [
  { href: "/", label: "Overview" },
  { href: "/trends", label: "Trends" },
  { href: "/engagement", label: "Engagement" },
  { href: "/timing", label: "Timing" },
  { href: "/reels", label: "Reels" },
  { href: "/strategy", label: "Strategy" },
  { href: "/plan", label: "Plan" },
  { href: "/outcomes", label: "Outcomes" },
  { href: "/explore", label: "Explore" },
];

export default function Nav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentTab =
    TABS.find((t) => (t.href === "/" ? pathname === "/" : pathname.startsWith(t.href))) || TABS[0];

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Close on outside click
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mobileOpen]);

  return (
    <header className="bg-ink-paper/90 backdrop-blur-md border-b border-ink-100 sticky top-0 z-50 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link href="/" className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <div className="w-9 h-9 shrink-0 rounded-xl bg-ink-paper ring-1 ring-ink-100 shadow-xs flex items-center justify-center overflow-hidden">
                <Image src="/shikho-bird.png" alt="Shikho" width={30} height={30} className="object-contain" />
              </div>
              <div className="leading-tight min-w-0">
                <div className="text-sm font-semibold text-brand-shikho-indigo truncate">Shikho</div>
                <div className="text-[11px] text-slate-500 -mt-0.5 truncate">Organic Social</div>
              </div>
            </Link>
            <span className="hidden sm:inline-flex ml-2 px-2 py-0.5 rounded-md bg-brand-shikho-indigo/10 text-brand-shikho-indigo text-[11px] font-semibold shrink-0">
              Facebook Page
            </span>
          </div>
          <button
            onClick={() =>
              fetch("/api/auth", { method: "DELETE" }).then(
                () => (window.location.href = "/login")
              )
            }
            className="text-xs text-slate-500 hover:text-slate-800 shrink-0 ml-2"
          >
            Sign out
          </button>
        </div>

        {/* Desktop tabs */}
        <nav className="hidden md:flex items-center gap-1 -mb-px overflow-x-auto">
          {TABS.map((t) => {
            const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  active
                    ? "border-brand-shikho-indigo text-brand-shikho-indigo"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        {/* Mobile dropdown */}
        <div className="md:hidden relative pb-2" ref={menuRef}>
          <button
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-haspopup="menu"
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-900 hover:bg-slate-50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <span className="text-slate-500 text-xs uppercase tracking-wide">Page</span>
              <span>{currentTab.label}</span>
            </span>
            <svg
              className={`w-4 h-4 text-slate-500 transition-transform ${mobileOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {mobileOpen && (
            <div
              role="menu"
              className="absolute left-0 right-0 mt-1 rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden z-50"
            >
              {TABS.map((t) => {
                const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    role="menuitem"
                    className={`block px-4 py-3 text-sm border-b border-slate-100 last:border-b-0 transition-colors ${
                      active
                        ? "bg-brand-shikho-indigo/10 text-brand-shikho-indigo font-semibold"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
