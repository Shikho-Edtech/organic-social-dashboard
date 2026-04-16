// Plan view — Content Calendar
import { getCalendar } from "@/lib/sheets";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const formatColors: Record<string, string> = {
  Reel: "#ec4899",
  Photo: "#3b82f6",
  Carousel: "#f59e0b",
  Video: "#8b5cf6",
  Link: "#14b8a6",
  Status: "#64748b",
};

export default async function PlanPage() {
  const calendar = await getCalendar();

  // Group by day
  const byDay: Record<string, typeof calendar> = {};
  for (const slot of calendar) {
    (byDay[slot.day] = byDay[slot.day] || []).push(slot);
  }

  const daysOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const orderedDays = daysOrder.filter((d) => byDay[d]?.length);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs text-slate-500 uppercase tracking-wider">Next week</div>
        <h1 className="text-2xl font-bold text-slate-100 mt-1">Content Plan</h1>
      </div>

      {calendar.length === 0 && (
        <div className="bg-ink-800 rounded-lg p-8 text-center">
          <div className="text-slate-400">No calendar generated yet.</div>
          <div className="text-slate-500 text-sm mt-2">
            Next weekly pipeline run will populate this.
          </div>
        </div>
      )}

      {orderedDays.map((day) => {
        const slots = byDay[day];
        return (
          <div key={day} className="bg-ink-800 rounded-lg overflow-hidden">
            <div className="px-5 py-3 bg-ink-900 border-b border-ink-700 flex items-center justify-between">
              <div>
                <div className="text-slate-100 font-semibold">{day}</div>
                <div className="text-xs text-slate-500">{slots[0]?.date}</div>
              </div>
              <div className="text-xs text-slate-500">{slots.length} posts</div>
            </div>
            <div className="divide-y divide-ink-700">
              {slots.map((slot, i) => {
                const color = formatColors[slot.format] || "#64748b";
                return (
                  <div key={i} className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 min-w-[72px]">
                        <div className="text-accent-cyan text-sm font-medium">{slot.time_bdt}</div>
                        <div className="text-xs text-slate-500 mt-0.5">BDT</div>
                      </div>
                      <div className="flex-shrink-0">
                        <span
                          className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                          style={{ backgroundColor: `${color}22`, color }}
                        >
                          {slot.format}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-slate-500">
                          {slot.pillar}
                          {slot.featured_entity && slot.featured_entity !== "None" && (
                            <span> · <span className="text-slate-400">{slot.featured_entity}</span></span>
                          )}
                          <span> · {slot.audience}</span>
                        </div>
                        <div className="text-slate-100 font-medium mt-1.5 leading-snug">
                          {slot.hook_line}
                        </div>
                        {slot.key_message && (
                          <div className="text-slate-400 text-sm mt-1">{slot.key_message}</div>
                        )}
                        {slot.visual_direction && (
                          <div className="text-xs text-slate-500 mt-2">
                            <span className="text-slate-400 font-medium">Visual: </span>
                            {slot.visual_direction}
                          </div>
                        )}
                        <div className="text-xs text-slate-500 mt-2">
                          <span className="text-slate-400 font-medium">CTA: </span>
                          {slot.cta}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs">
                          {slot.expected_reach && (
                            <span className="text-slate-500">
                              <span className="text-slate-400">Expected: </span>{slot.expected_reach}
                            </span>
                          )}
                          {slot.success_metric && (
                            <span className="text-slate-500">
                              <span className="text-slate-400">Success: </span>{slot.success_metric}
                            </span>
                          )}
                        </div>
                        {slot.rationale && (
                          <details className="mt-2">
                            <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300">Rationale</summary>
                            <div className="mt-1.5 text-xs text-slate-400 bg-ink-900 rounded p-2">{slot.rationale}</div>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="text-center text-xs text-slate-600 py-4">
        Edit slots directly in the Content_Calendar tab of the Google Sheet.
        <br />
        Changes reflect here within 5 minutes.
      </div>
    </div>
  );
}
