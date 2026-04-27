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
    queryFn: async () => {
      const [users, research, likes, comments] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("research").select("id", { count: "exact", head: true }),
        supabase.from("likes").select("id", { count: "exact", head: true }),
        supabase.from("comments").select("id", { count: "exact", head: true }),
      ]);
      return {
        users: users.count ?? 0,
        research: research.count ?? 0,
        likes: likes.count ?? 0,
        comments: comments.count ?? 0,
      };
    },
  });

  const cards = [
    { label: "Total Users", value: data?.users ?? 0, I: Users },
    { label: "Total Research", value: data?.research ?? 0, I: FileText },
    { label: "Total Likes", value: data?.likes ?? 0, I: Heart },
    { label: "Total Comments", value: data?.comments ?? 0, I: MessageCircle },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold gradient-text mb-6">Overview</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(({ label, value, I }) => (
          <div key={label} className="glass-strong rounded-2xl p-5">
            <I className="h-6 w-6 text-primary mb-3" />
            <div className="text-3xl font-bold">{value}</div>
            <div className="text-xs text-muted-foreground mt-1">{label}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-6">Charts and detailed analytics coming in Phase 2.</p>
    </div>
  );
}
