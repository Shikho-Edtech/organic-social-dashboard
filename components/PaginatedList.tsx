// Sprint P7 v4.18 W2 Fri (W13) — reusable pagination shell.
//
// Designed to wrap any large list (table rows, card list, ranked items)
// where the user benefits from "see more" affordance without ballooning
// initial render. The component is intentionally render-prop based: it
// owns the page state + nav controls but knows nothing about how the
// rows are presented (desktop table vs mobile cards vs anything else).
//
// Usage:
//   <PaginatedList items={rows} pageSize={10} ariaLabel="Recent Reels">
//     {({ visibleItems, page, totalPages, setPage }) => (
//       <table>
//         {visibleItems.map(...)}
//       </table>
//     )}
//   </PaginatedList>
//
// The component renders its children, then a pagination control strip
// below (Prev / page indicator / Next) — clamped to viewport, keyboard-
// navigable, with the standard focus-visible ring. When items.length
// fits in one page, the control strip is omitted entirely so single-
// page lists don't carry decorative chrome.

"use client";

import { ReactNode, useState, useEffect } from "react";

type PaginatedListProps<T> = {
  items: T[];
  pageSize: number;
  initialPage?: number;
  ariaLabel?: string;
  /** Hide the controls even if items.length > pageSize. Rare. */
  hideControls?: boolean;
  /** Render-prop: caller renders the visible slice however it wants. */
  children: (args: {
    visibleItems: T[];
    page: number;
    totalPages: number;
    setPage: (n: number) => void;
    startIndex: number;
    endIndex: number;
  }) => ReactNode;
};

export default function PaginatedList<T>({
  items,
  pageSize,
  initialPage = 0,
  ariaLabel = "Pagination",
  hideControls = false,
  children,
}: PaginatedListProps<T>) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const [page, setPage] = useState(Math.min(initialPage, totalPages - 1));

  // If items shrink (e.g. parent re-renders with filtered data) and current
  // page falls past the new last page, snap back. Without this the user
  // would see an empty page after a filter narrows the dataset.
  useEffect(() => {
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [totalPages, page]);

  const startIndex = page * pageSize;
  const endIndex = Math.min(items.length, startIndex + pageSize);
  const visibleItems = items.slice(startIndex, endIndex);

  const showControls = !hideControls && items.length > pageSize;
  const canPrev = page > 0;
  const canNext = page < totalPages - 1;

  return (
    <div>
      {children({ visibleItems, page, totalPages, setPage, startIndex, endIndex })}

      {showControls && (
        <nav
          aria-label={ariaLabel}
          className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mt-4 px-4 py-3 border-t border-ink-100"
        >
          <p className="text-xs text-ink-muted tabular-nums">
            Showing <span className="font-medium text-ink-secondary">{startIndex + 1}–{endIndex}</span> of{" "}
            <span className="font-medium text-ink-secondary">{items.length}</span>
          </p>
          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => canPrev && setPage(page - 1)}
              disabled={!canPrev}
              aria-label="Previous page"
              className={[
                "px-3 py-1.5 rounded-md text-xs font-medium border transition-colors duration-base",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-shikho-indigo focus-visible:ring-offset-1",
                canPrev
                  ? "bg-ink-paper text-ink-secondary border-ink-100 hover:bg-ink-50"
                  : "bg-ink-50 text-ink-muted border-ink-100 cursor-not-allowed opacity-60",
              ].join(" ")}
            >
              ‹ Prev
            </button>
            <span className="px-2.5 text-xs text-ink-muted tabular-nums whitespace-nowrap">
              Page <span className="font-semibold text-ink-secondary">{page + 1}</span> of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => canNext && setPage(page + 1)}
              disabled={!canNext}
              aria-label="Next page"
              className={[
                "px-3 py-1.5 rounded-md text-xs font-medium border transition-colors duration-base",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-shikho-indigo focus-visible:ring-offset-1",
                canNext
                  ? "bg-ink-paper text-ink-secondary border-ink-100 hover:bg-ink-50"
                  : "bg-ink-50 text-ink-muted border-ink-100 cursor-not-allowed opacity-60",
              ].join(" ")}
            >
              Next ›
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
