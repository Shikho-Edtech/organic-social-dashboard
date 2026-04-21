export default function DataFooter() {
  return (
    <footer className="max-w-7xl mx-auto px-6 pb-8 pt-2 text-xs text-ink-muted">
      <div className="border-t border-ink-100 pt-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>
              Source of truth: <span className="text-ink-secondary font-medium">Facebook Graph API → Google Sheets</span>
            </span>
          </div>
          <div>
            Dashboard cache: <span className="text-ink-secondary font-medium">5 min</span>
          </div>
          <div>
            Pipeline: <span className="text-ink-secondary font-medium">weekly run</span>
          </div>
        </div>
        <div className="lg:text-right">
          All numbers are unique per post. &ldquo;Engagement rate&rdquo; = (reactions + comments + shares) ÷ unique reach.
        </div>
      </div>
    </footer>
  );
}
