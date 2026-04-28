import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/admin/active/$period")({ component: ActiveHistory });

const TITLES: Record<string, string> = {
  daily: "Daily active users",
  weekly: "Weekly active users",
  monthly: "Monthly active users",
};

function ActiveHistory() {
  const { period } = Route.useParams();
  const valid = period === "daily" || period === "weekly" || period === "monthly";

  const { data = [], isLoading } = useQuery({
    queryKey: ["active-history", period],
    enabled: valid,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_active_history" as never, { period } as never);
      if (error) throw error;
      return (data as any) ?? [];
    },
  });

  if (!valid) return <div className="text-muted-foreground">Invalid period.</div>;

  const formatBucket = (row: any) => {
    if (period === "daily") {
      return new Date(row.bucket).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
    }
    if (period === "weekly") {
      const start = new Date(row.start);
      const end = new Date(start); end.setDate(end.getDate() + 6);
      return `${row.bucket} • ${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
    }
    return new Date(row.start).toLocaleDateString(undefined, { year: "numeric", month: "long" });
  };

  return (
    <div className="space-y-6">
      <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to overview
      </Link>
      <h1 className="text-2xl font-bold gradient-text">{TITLES[period]}</h1>

      {isLoading ? (
        <div className="glass rounded-xl h-40 animate-pulse" />
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
      ) : (
        <div className="glass-strong rounded-2xl divide-y divide-border overflow-hidden">
          {data.map((row: any, i: number) => (
            <div key={i} className="flex items-center justify-between px-5 py-3">
              <div className="text-sm">{formatBucket(row)}</div>
              <div className="text-lg font-bold gradient-text">{row.count}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
