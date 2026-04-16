// Shared date-range helper for all pages
// Parses ?range= URL params into a { start, end, label } bundle.

export type RangeSpec = {
  start: Date;
  end: Date;
  label: string;
  key: string;
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatRangeLabel(start: Date, end: Date): string {
  const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endStr = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${startStr} → ${endStr}`;
}

export function resolveRange(searchParams: Record<string, string | string[] | undefined>): RangeSpec {
  const now = new Date();
  const key = (searchParams.range as string) || "30d";

  let start: Date;
  let end: Date = endOfDay(now);

  if (key === "7d") start = daysAgo(7);
  else if (key === "30d") start = daysAgo(30);
  else if (key === "90d") start = daysAgo(90);
  else if (key === "mtd") start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
  else if (key === "ytd") start = startOfDay(new Date(now.getFullYear(), 0, 1));
  else if (key === "all") start = new Date("2024-01-01");
  else if (key === "custom") {
    const s = searchParams.start as string;
    const e = searchParams.end as string;
    start = s ? startOfDay(new Date(s)) : daysAgo(30);
    end = e ? endOfDay(new Date(e)) : endOfDay(now);
  } else {
    start = daysAgo(30);
  }

  return {
    start,
    end,
    key,
    label: formatRangeLabel(start, end),
  };
}

export { formatDate };
