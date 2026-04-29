import { getPosts, getDailyMetrics } from "@/lib/sheets";
import ExploreClient from "./ExploreClient";
import MetricSelector, { parseMetricParam, parseWeightsParam } from "@/components/MetricSelector";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const [posts, daily] = await Promise.all([getPosts(), getDailyMetrics()]);
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
      />
    </>
  );
}
