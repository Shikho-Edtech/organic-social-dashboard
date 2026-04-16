"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "This Week" },
  { href: "/plan", label: "Plan" },
  { href: "/playbook", label: "Playbook" },
  { href: "/explore", label: "Explore" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-ink-800 bg-ink-900 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-gradient-to-br from-accent-cyan to-accent-blue flex items-center justify-center font-bold text-white text-sm">
              S
            </div>
            <span className="font-semibold text-slate-100">Shikho</span>
            <span className="text-slate-500 text-sm hidden sm:inline">Organic Social</span>
          </Link>
          <div className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    active ? "bg-ink-800 text-slate-100" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
        <button
          onClick={() => fetch("/api/auth", { method: "DELETE" }).then(() => (window.location.href = "/login"))}
          className="text-slate-500 hover:text-slate-300 text-sm"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
