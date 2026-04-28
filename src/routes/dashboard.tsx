import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Heart, MessageCircle, Menu, X, Search } from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { TopBar } from "@/components/TopBar";
import { ChatWidget } from "@/components/ChatWidget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type Category = "all" | "drugs" | "disease" | "discovery";
type Research = {
  id: string;
  title: string;
  description: string;
  header_image_url: string | null;
  category: Exclude<Category, "all">;
  section: string | null;
  created_at: string;
  like_count: number;
  comment_count: number;
};

export const Route = createFileRoute("/dashboard")({
  component: () => <RequireAuth><Dashboard /></RequireAuth>,
  head: () => ({ meta: [{ title: "Dashboard — Ecomedic Squad" }] }),
});

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "all", label: "All" },
  { id: "drugs", label: "Drugs" },
  { id: "disease", label: "Disease" },
  { id: "discovery", label: "Discovery" },
];

function Dashboard() {
  const [search, setSearch] = useState("");
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: research = [], isLoading } = useQuery({
    queryKey: ["research-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("research")
        .select("id, title, description, header_image_url, category, section, created_at, likes(count), comments(count)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        like_count: r.likes?.[0]?.count ?? 0,
        comment_count: r.comments?.[0]?.count ?? 0,
      })) as Research[];
    },
  });

  const filtered = useMemo(() => {
    let list = research;
    if (category !== "all") list = list.filter((r) => r.category === category);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        (r.section ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [research, category, search]);

  const sidebarList = useMemo(() => {
    let list = [...research].sort((a, b) => a.title.localeCompare(b.title));
    if (sidebarSearch.trim()) {
      const q = sidebarSearch.toLowerCase();
      list = list.filter((r) => r.title.toLowerCase().includes(q) || (r.section ?? "").toLowerCase().includes(q));
    }
    return list;
  }, [research, sidebarSearch]);

  return (
    <div className="min-h-screen">
      <TopBar search={search} onSearchChange={setSearch} homeTo="/dashboard" profileTo="/profile" />

      {/* Category strip */}
      <div className="border-b border-border bg-background/40">
        <div className="container mx-auto px-4 h-12 flex items-center gap-2 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setSidebarOpen((s) => !s)}
            className="shrink-0 p-2 rounded-md hover:bg-muted/50 mr-1"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={cn(
                "shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all border",
                category === c.id
                  ? "gradient-bg text-primary-foreground border-transparent glow"
                  : "border-border hover:bg-muted/50 text-muted-foreground"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed lg:sticky top-[164px] left-0 z-20 h-[calc(100vh-164px)] w-72 glass-strong border-r border-border transition-transform overflow-y-auto",
            sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0 lg:w-0 lg:border-0"
          )}
        >
          {sidebarOpen && (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">All Research (A–Z)</h3>
                <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 hover:bg-muted/50 rounded">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  placeholder="Search research..."
                  className="pl-9 glass h-9"
                />
              </div>
              <ul className="space-y-1 text-sm">
                {sidebarList.map((r, i) => (
                  <li key={r.id}>
                    <Link
                      to="/research/$id" params={{ id: r.id }}
                      className="flex gap-2 p-2 rounded-md hover:bg-muted/50 transition"
                      onClick={() => setSidebarOpen(false)}
                    >
                      <span className="text-muted-foreground text-xs w-6 shrink-0 mt-0.5">{i + 1}.</span>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{r.title}</div>
                        {r.section && <div className="text-xs text-muted-foreground truncate">{r.section}</div>}
                      </div>
                    </Link>
                  </li>
                ))}
                {sidebarList.length === 0 && (
                  <li className="text-xs text-muted-foreground p-2">No research found.</li>
                )}
              </ul>
            </div>
          )}
        </aside>

        {/* Main grid */}
        <main className="flex-1 container mx-auto px-4 py-6">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="glass rounded-2xl h-72 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="glass-strong rounded-2xl p-12 text-center">
              <h2 className="text-xl font-semibold">No research yet</h2>
              <p className="text-muted-foreground mt-2 text-sm">
                Check back soon — our team is publishing new studies regularly.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 max-w-[85%] mx-auto">
              {filtered.map((r) => <ResearchCard key={r.id} r={r} />)}
            </div>
          )}
        </main>
      </div>
      <ChatWidget />
    </div>
  );
}

function ResearchCard({ r }: { r: Research }) {
  return (
    <Link
      to="/research/$id" params={{ id: r.id }}
      className="glass rounded-2xl overflow-hidden hover:glow transition-all group flex flex-col"
    >
      <div className="aspect-video bg-muted/30 relative overflow-hidden">
        {r.header_image_url ? (
          <img src={r.header_image_url} alt={r.title} className="h-full w-full object-cover group-hover:scale-105 transition-transform" />
        ) : (
          <div className="h-full w-full gradient-bg opacity-30" />
        )}
        <span className="absolute top-3 left-3 text-[10px] uppercase tracking-wider bg-background/70 backdrop-blur px-2 py-1 rounded-full font-semibold">
          {r.category}
        </span>
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-semibold text-base line-clamp-2">{r.title}</h3>
        <p className="text-sm text-muted-foreground mt-1 line-clamp-3 flex-1">{r.description}</p>
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> {r.like_count}</span>
          <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> {r.comment_count}</span>
        </div>
      </div>
    </Link>
  );
}
