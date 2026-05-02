"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";

// Sprint P7 v4.17 (2026-05-02): bucket-grouped navigation (Option B —
// time-cadence grouping). 11 pages live behind 4 buckets so the top-level
// nav scans in 4 items instead of 11. The selected bucket reveals its
// sub-pages in a second row; clicking a single-page bucket (Today,
// Reference) goes there directly. Mobile collapses to a single grouped
// dropdown that retains every page.

type SubPage = { href: string; label: string };
type Bucket = {
  id: "today" | "pulse" | "weekly" | "reference";
  label: string;
  /** Where clicking the bucket itself navigates (= first sub-page) */
  defaultHref: string;
  pages: SubPage[];
  /** Short hint shown under the bucket label on the second row */
  hint: string;
};

const BUCKETS: Bucket[] = [
  {
    id: "today",
    label: "Today",
    defaultHref: "/today",
    pages: [{ href: "/today", label: "Today" }],
    hint: "What to watch right now",
  },
  {
    id: "pulse",
    label: "Pulse",
    defaultHref: "/",
    pages: [
      { href: "/", label: "Overview" },
      { href: "/trends", label: "Trends" },
      { href: "/engagement", label: "Engagement" },
      { href: "/timing", label: "Timing" },
      { href: "/reels", label: "Reels" },
      { href: "/explore", label: "Explore" },
    ],
    hint: "Performance across rolling windows",
  },
  {
    id: "weekly",
    label: "Weekly",
    defaultHref: "/diagnosis",
    pages: [
      { href: "/diagnosis", label: "Diagnosis" },
      { href: "/plan", label: "Plan" },
      { href: "/outcomes", label: "Outcomes" },
    ],
    hint: "Mon–Sun verdict, plan, scoreboard",
  },
  {
    id: "reference",
    label: "Reference",
    defaultHref: "/reference",
    pages: [{ href: "/reference", label: "Reference" }],
    hint: "Definitions and taxonomies",
  },
];

/** Resolve which bucket + page is active given the URL. */
function resolveActive(pathname: string): {
  bucket: Bucket;
  page: SubPage;
} {
  // Exact-or-prefix match against every page across buckets, longest first
  // so /outcomes wins over / for /outcomes paths.
  type Candidate = { bucket: Bucket; page: SubPage; depth: number };
  const candidates: Candidate[] = [];
  for (const b of BUCKETS) {
    for (const p of b.pages) {
      const depth = p.href === "/" ? 0 : p.href.length;
      const match =
        p.href === "/"
          ? pathname === "/"
          : pathname === p.href || pathname.startsWith(p.href + "/");
      if (match) candidates.push({ bucket: b, page: p, depth });
    }
  }
  candidates.sort((a, b) => b.depth - a.depth);
  if (candidates[0]) return { bucket: candidates[0].bucket, page: candidates[0].page };
  // Default landing
  return { bucket: BUCKETS[0], page: BUCKETS[0].pages[0] };
}

export default function Nav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { bucket: activeBucket, page: activePage } = resolveActive(pathname);
  const showSubRow = activeBucket.pages.length > 1;

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
        {/* Top bar — logo + sign out (unchanged) */}
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link href="/today" className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <div className="w-9 h-9 shrink-0 rounded-xl bg-ink-paper ring-1 ring-ink-100 shadow-xs flex items-center justify-center overflow-hidden">
                <Image src="/shikho-bird.png" alt="Shikho" width={30} height={30} className="object-contain" />
              </div>
              <div className="leading-tight min-w-0">
                <div className="text-sm font-semibold text-brand-shikho-indigo truncate">Shikho</div>
                <div className="text-[11px] text-ink-muted -mt-0.5 truncate">Organic Social</div>
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
            className="text-xs text-ink-muted hover:text-ink-primary shrink-0 ml-2"
          >
            Sign out
          </button>
        </div>

        {/* DESKTOP — bucket pills (row 1) + sub-page pills (row 2 if multi) */}
        <nav className="hidden md:block">
          {/* Row 1: bucket pills */}
          <div className="flex items-center gap-1 -mb-px overflow-x-auto">
            {BUCKETS.map((b) => {
              const isActive = b.id === activeBucket.id;
              return (
                <Link
                  key={b.id}
                  href={b.defaultHref}
                  aria-current={isActive ? "page" : undefined}
                  className={`px-3.5 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                    isActive
                      ? "border-brand-shikho-indigo text-brand-shikho-indigo"
                      : "border-transparent text-ink-muted hover:text-ink-primary"
                  }`}
                >
                  {b.label}
                  <span className={`ml-1.5 text-[10px] uppercase tracking-wider font-normal ${
                    isActive ? "text-brand-shikho-indigo/70" : "text-ink-300"
                  }`}>
                    {b.pages.length > 1 ? `· ${b.pages.length}` : ""}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Row 2: sub-page pills for the active multi-page bucket. Single-
              page buckets (Today, Reference) skip this row to avoid noise. */}
          {showSubRow && (
            <div className="flex items-center gap-2 py-2 overflow-x-auto border-t border-ink-100/60">
              <span className="text-[10px] uppercase tracking-wider text-ink-muted font-semibold whitespace-nowrap mr-1">
                {activeBucket.hint}:
              </span>
              {activeBucket.pages.map((p) => {
                const isActivePage = p.href === activePage.href;
                return (
                  <Link
                    key={p.href}
                    href={p.href}
                    aria-current={isActivePage ? "page" : undefined}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                      isActivePage
                        ? "bg-brand-shikho-indigo text-white"
                        : "text-ink-secondary hover:bg-shikho-indigo-50 hover:text-brand-shikho-indigo"
                    }`}
                  >
                    {p.label}
                  </Link>
                );
              })}
            </div>
          )}
        </nav>

        {/* MOBILE — single dropdown that shows ALL 11 pages grouped under
            their bucket headers. No information lost vs the old flat menu;
            scans cleanly because related pages cluster. */}
        <div className="md:hidden relative pb-2" ref={menuRef}>
          <button
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-haspopup="menu"
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-ink-100 bg-ink-paper text-sm font-medium text-ink-primary hover:bg-ink-50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <span className="text-ink-muted text-xs uppercase tracking-wide">{activeBucket.label}</span>
              <span>{activePage.label}</span>
            </span>
            <svg
              className={`w-4 h-4 text-ink-muted transition-transform ${mobileOpen ? "rotate-180" : ""}`}
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
              className="absolute left-0 right-0 mt-1 rounded-lg border border-ink-100 bg-ink-paper shadow-lg overflow-hidden z-50 max-h-[80vh] overflow-y-auto"
            >
              {BUCKETS.map((b) => (
                <div key={b.id} className="border-b border-ink-100 last:border-b-0">
                  <div className="px-4 py-2 bg-ink-50 text-[10px] uppercase tracking-wider font-bold text-ink-muted">
                    {b.label}
                    <span className="ml-1.5 normal-case font-normal text-ink-300">{b.hint}</span>
                  </div>
                  {b.pages.map((p) => {
                    const isActivePage = p.href === activePage.href;
                    return (
                      <Link
                        key={p.href}
                        href={p.href}
                        role="menuitem"
                        className={`block px-5 py-3 text-sm transition-colors ${
                          isActivePage
                            ? "bg-brand-shikho-indigo/10 text-brand-shikho-indigo font-semibold"
                            : "text-ink-secondary hover:bg-ink-50"
                        }`}
                      >
                        {p.label}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
