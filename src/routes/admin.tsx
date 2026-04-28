import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { TopBar } from "@/components/TopBar";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  component: () => <RequireAuth requireAdmin><AdminLayout /></RequireAuth>,
  head: () => ({ meta: [{ title: "Admin — Ecomedic Squad" }] }),
});

const TABS = [
  { to: "/admin", label: "Overview", exact: true },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/chat", label: "Chat" },
  { to: "/admin/research", label: "Research" },
  { to: "/admin/research/new", label: "Add Research" },
];

function AdminLayout() {
  const [search, setSearch] = useState("");
  const location = useLocation();

  return (
    <div className="min-h-screen">
      <TopBar search={search} onSearchChange={setSearch} homeTo="/admin" profileTo="/profile" />
      <div className="border-b border-border bg-background/40">
        <div className="container mx-auto px-4 h-12 flex items-center gap-2 overflow-x-auto scrollbar-hide">
          {TABS.map((t) => {
            const active = t.exact ? location.pathname === t.to : location.pathname.startsWith(t.to);
            return (
              <Link key={t.to} to={t.to as never}
                className={cn(
                  "shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition border",
                  active ? "gradient-bg text-primary-foreground border-transparent glow" : "border-border text-muted-foreground hover:bg-muted/50"
                )}>
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
      <main className="container mx-auto px-4 py-6">
        {location.pathname === "/admin" ? <Overview /> : <Outlet />}
      </main>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, FileText, Heart, MessageCircle } from "lucide-react";

function localDay(d = new Date()) {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

async function withRetry<T>(task: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const result = await task();
      if (result && typeof result === "object" && "error" in result && result.error) {
        throw result.error;
      }
      return result;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 600 * (i + 1)));
    }
  }
  throw lastError;
}

function Overview() {
  const { data } = useQuery({
    queryKey: ["admin-stats"],
    staleTime: 0,
    refetchInterval: 15_000,
    queryFn: async () => {
      const today = new Date();
      const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 6);
      const monthAgo = new Date(today); monthAgo.setDate(today.getDate() - 29);
      const isoDay = localDay;

      const [users, research, likes, comments, days] = await Promise.all([
        withRetry(async () => supabase.from("profiles").select("id", { count: "exact", head: true })),
        withRetry(async () => supabase.from("research").select("id", { count: "exact", head: true })),
        withRetry(async () => supabase.from("likes").select("id", { count: "exact", head: true })),
        withRetry(async () => supabase.from("comments").select("id", { count: "exact", head: true })),
        withRetry(async () => supabase.from("active_days").select("user_id,day").gte("day", isoDay(monthAgo))),
      ]);

      for (const result of [users, research, likes, comments, days]) {
        if (result.error) throw result.error;
      }

      const todayStr = isoDay(today);
      const dayMap = new Map<string, Set<string>>();
      for (const r of (days.data ?? []) as any[]) {
        if (!dayMap.has(r.day)) dayMap.set(r.day, new Set());
        dayMap.get(r.day)!.add(r.user_id);
      }
      const last7: { label: string; count: number }[] = [];
      const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today); d.setDate(today.getDate() - i);
        last7.push({ label: labels[d.getDay()], count: dayMap.get(isoDay(d))?.size ?? 0 });
      }
      const dailyActive = dayMap.get(todayStr)?.size ?? 0;
      const weeklyUsers = new Set<string>();
      const monthlyUsers = new Set<string>();
      for (const [d, set] of dayMap.entries()) {
        const dt = new Date(d);
        if (dt >= weekAgo) set.forEach((u) => weeklyUsers.add(u));
        if (dt >= monthAgo) set.forEach((u) => monthlyUsers.add(u));
      }

      return {
        users: users.count ?? 0,
        research: research.count ?? 0,
        likes: likes.count ?? 0,
        comments: comments.count ?? 0,
        last7,
        dailyActive,
        weeklyActive: weeklyUsers.size,
        monthlyActive: monthlyUsers.size,
      };
    },
  });

  const last7 = data?.last7 ?? [];
  const max = Math.max(1, ...last7.map((d) => d.count));

  const cards = [
    { label: "Daily Active", value: data?.dailyActive ?? 0, I: Users },
    { label: "Weekly Active", value: data?.weeklyActive ?? 0, I: Users },
    { label: "Monthly Active", value: data?.monthlyActive ?? 0, I: Users },
    { label: "Total Likes", value: data?.likes ?? 0, I: Heart },
    { label: "Total Comments", value: data?.comments ?? 0, I: MessageCircle },
    { label: "Total Users", value: data?.users ?? 0, I: FileText },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold gradient-text">Overview</h1>
      <div className="glass-strong rounded-2xl p-5">
        <div className="text-sm font-semibold mb-4">Daily active users (last 7 days)</div>
        <div className="flex items-end gap-3 h-48">
          {last7.map((d, i) => {
            const h = (d.count / max) * 100;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <div className="text-xs text-muted-foreground">{d.count}</div>
                <div className="w-full bg-muted/30 rounded-md overflow-hidden flex-1 flex items-end">
                  <div className="w-full gradient-bg rounded-md transition-all" style={{ height: `${h}%` }} />
                </div>
                <div className="text-xs text-muted-foreground">{d.label}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map(({ label, value, I }) => (
          <div key={label} className="glass-strong rounded-2xl p-5">
            <I className="h-6 w-6 text-primary mb-3" />
            <div className="text-3xl font-bold">{value}</div>
            <div className="text-xs text-muted-foreground mt-1">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
