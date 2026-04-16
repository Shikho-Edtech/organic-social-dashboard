import { getPosts, getDailyMetrics } from "@/lib/sheets";
import ExploreClient from "./ExploreClient";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export default async function ExplorePage() {
  const [posts, daily] = await Promise.all([getPosts(), getDailyMetrics()]);
  return <ExploreClient posts={posts} daily={daily} />;
}
