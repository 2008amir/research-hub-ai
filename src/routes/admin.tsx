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

function Overview() {
  const { data } = useQuery({
    queryKey: ["admin-stats"],
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_stats");
      if (error) throw error;
      const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const last7Raw = (data as any)?.last7 ?? [];
      const last7 = last7Raw.map((d: any) => ({
        label: labels[new Date(d.day).getDay()],
        count: d.count ?? 0,
      }));
      return {
        users: (data as any)?.users ?? 0,
        research: (data as any)?.research ?? 0,
        likes: (data as any)?.likes ?? 0,
        comments: (data as any)?.comments ?? 0,
        last7,
        dailyActive: (data as any)?.dailyActive ?? 0,
        weeklyActive: (data as any)?.weeklyActive ?? 0,
        monthlyActive: (data as any)?.monthlyActive ?? 0,
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
