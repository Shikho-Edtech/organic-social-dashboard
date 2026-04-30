import { getPosts, getDailyMetrics, getRunStatus } from "@/lib/sheets";
import ExploreClient from "./ExploreClient";
import MetricSelector, { parseMetricParam, parseWeightsParam } from "@/components/MetricSelector";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  // Sprint P7 v4.6 (2026-04-30, P0 finding #2): fetch runStatus so
  // ExploreClient can display the same "Data as of" stamp the rest of
  // the dashboard shows. Without it, Explore KPIs appeared to disagree
  // with Overview when QA'd at different times — but really both were
  // showing their own warm-cache data with no way for the user to
  // reconcile freshness. PageHeader pattern uses lastScrapedAt for this.
  const [posts, daily, runStatus] = await Promise.all([
    getPosts(),
    getDailyMetrics(),
    getRunStatus(),
  ]);
  // Sprint P7 Phase 3: page-level multi-metric ranking. ExploreClient
  // ranks all post lists by composite when 2+ metrics are active.
  const activeMetrics = parseMetricParam(searchParams.metric);
  const activeWeights = parseWeightsParam(searchParams.weights, activeMetrics.length);
  return (
    <>
      <MetricSelector
        basePath="/explore"
        active={activeMetrics}
        weights={activeWeights}
        preserve={searchParams}
      />
      <ExploreClient
        posts={posts}
        daily={daily}
        activeMetrics={activeMetrics}
        activeWeights={activeWeights}
        lastScrapedAt={runStatus?.last_run_at}
      />
    </>
  );
}
