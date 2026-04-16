import { getPosts, getLatestDiagnosis } from "@/lib/sheets";
import { filterPosts, daysAgo, groupStats, topByEngagement, reach, engagementRate } from "@/lib/aggregate";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export default async function PlaybookPage() {
  const [posts, diagnosis] = await Promise.all([getPosts(), getLatestDiagnosis()]);

  const last90 = filterPosts(posts, { start: daysAgo(90), end: new Date() });

  // Winning pillar-format combos (min 3 posts, top by engagement rate)
  const comboMap: Record<string, { posts: any[]; total_reach: number; total_eng: number }> = {};
  for (const p of last90) {
    const key = `${p.content_pillar || "—"} | ${p.format || p.type}${p.featured_entity && p.featured_entity !== "None" ? ` | ${p.featured_entity}` : ""}`;
    const c = comboMap[key] || { posts: [], total_reach: 0, total_eng: 0 };
    c.posts.push(p);
    c.total_reach += reach(p);
    c.total_eng += engagementRate(p);
    comboMap[key] = c;
  }
  const combos = Object.entries(comboMap)
    .filter(([, v]) => v.posts.length >= 3)
    .map(([key, v]) => ({
      key,
      count: v.posts.length,
      avg_reach: Math.round(v.total_reach / v.posts.length),
      avg_eng: v.total_eng / v.posts.length,
    }))
    .sort((a, b) => b.avg_eng - a.avg_eng);

  const winners = combos.slice(0, 8);
  const laggers = [...combos].reverse().slice(0, 4);

  const hookStats = groupStats(last90, "hook_type").filter((g) => g.count >= 3).slice(0, 8);
  const visualStats = groupStats(last90, "visual_style").filter((g) => g.count >= 3).slice(0, 6);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Playbook</h1>
        <div className="text-sm text-slate-500">What's working, what's not. Compound knowledge from 90 days of data.</div>
      </div>

      {/* Winning patterns */}
      <div className="bg-ink-800 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-slate-100 font-semibold">Winning patterns</h3>
            <div className="text-xs text-slate-500">Pillar × Format × Entity combinations · min 3 posts · ranked by avg engagement rate</div>
          </div>
        </div>
        <div className="space-y-2">
          {winners.map((w) => (
            <div key={w.key} className="flex items-center justify-between border-l-2 border-accent-green pl-3 py-1">
              <div>
                <div className="text-sm text-slate-100 font-medium">{w.key}</div>
                <div className="text-xs text-slate-500">{w.count} posts · avg reach {w.avg_reach.toLocaleString()}</div>
              </div>
              <div className="text-accent-green font-bold text-sm">{w.avg_eng.toFixed(2)}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* Laggers */}
      <div className="bg-ink-800 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-slate-100 font-semibold">Underperforming patterns</h3>
            <div className="text-xs text-slate-500">Consider retiring or refreshing these combos</div>
          </div>
        </div>
        <div className="space-y-2">
          {laggers.map((w) => (
            <div key={w.key} className="flex items-center justify-between border-l-2 border-accent-red pl-3 py-1">
              <div>
                <div className="text-sm text-slate-100 font-medium">{w.key}</div>
                <div className="text-xs text-slate-500">{w.count} posts · avg reach {w.avg_reach.toLocaleString()}</div>
              </div>
              <div className="text-accent-red font-bold text-sm">{w.avg_eng.toFixed(2)}%</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Hook effectiveness */}
        <div className="bg-ink-800 rounded-lg p-5">
          <h3 className="text-slate-100 font-semibold mb-3">Hook type effectiveness</h3>
          <div className="space-y-1.5">
            {hookStats.map((h) => (
              <div key={h.key} className="flex items-center gap-3">
                <div className="text-xs text-slate-400 w-32 truncate">{h.key}</div>
                <div className="flex-1 h-5 bg-ink-900 rounded overflow-hidden">
                  <div
                    className="h-full bg-accent-cyan"
                    style={{ width: `${Math.min(100, h.avg_engagement_rate * 20)}%` }}
                  />
                </div>
                <div className="text-xs text-slate-400 w-16 text-right">{h.avg_engagement_rate.toFixed(2)}%</div>
              </div>
            ))}
          </div>
        </div>

        {/* Visual style */}
        <div className="bg-ink-800 rounded-lg p-5">
          <h3 className="text-slate-100 font-semibold mb-3">Visual style winners</h3>
          <div className="space-y-1.5">
            {visualStats.map((v) => (
              <div key={v.key} className="flex items-center gap-3">
                <div className="text-xs text-slate-400 w-32 truncate">{v.key}</div>
                <div className="flex-1 h-5 bg-ink-900 rounded overflow-hidden">
                  <div
                    className="h-full bg-accent-pink"
                    style={{ width: `${Math.min(100, v.avg_engagement_rate * 20)}%` }}
                  />
                </div>
                <div className="text-xs text-slate-400 w-16 text-right">{v.avg_engagement_rate.toFixed(2)}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Latest strategic observations */}
      {diagnosis && diagnosis.top_performers && diagnosis.top_performers.length > 0 && (
        <div className="bg-ink-800 rounded-lg p-5">
          <h3 className="text-slate-100 font-semibold mb-3">Latest insights (from weekly run)</h3>
          <div className="space-y-3">
            {diagnosis.top_performers.slice(0, 3).map((tp: any, i: number) => (
              <div key={i} className="border-l-2 border-accent-green pl-3">
                <div className="text-sm text-slate-100">{tp.metric_highlight}</div>
                <div className="text-xs text-slate-500 mt-0.5">Why: {tp.why_it_worked}</div>
                <div className="text-xs text-accent-cyan mt-1">Replicate: {tp.replicable_elements}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-center text-xs text-slate-600 py-4">
        Patterns computed from last 90 days · minimum 3 posts per combo for inclusion.
      </div>
    </div>
  );
}
