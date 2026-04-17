export default function DataFooter() {
  return (
    <footer className="max-w-7xl mx-auto px-6 pb-8 pt-2 text-xs text-slate-400">
      <div className="border-t border-slate-200 pt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>
            Source of truth: <span className="text-slate-600 font-medium">Facebook Graph API → Google Sheets</span>
          </span>
        </div>
        <div>
          Dashboard cache: <span className="text-slate-600 font-medium">5 min</span>
        </div>
        <div>
          Pipeline: <span className="text-slate-600 font-medium">weekly run</span>
        </div>
        <div className="ml-auto">
          All numbers are unique per post. "Engagement rate" = (reactions + comments + shares) ÷ unique reach.
        </div>
      </div>
    </footer>
  );
}
