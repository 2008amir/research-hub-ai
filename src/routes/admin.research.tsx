import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/research")({ component: AdminResearchLayout });

function AdminResearchLayout() {
  const location = useLocation();
  if (location.pathname !== "/admin/research") return <Outlet />;
  return <AdminResearch />;
}

function AdminResearch() {
  const qc = useQueryClient();
  const { data: list = [] } = useQuery({
    queryKey: ["admin-research"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("research")
        .select("id, title, description, header_image_url, category, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const remove = async (id: string) => {
    if (!confirm("Delete this research?")) return;
    const { error } = await supabase.from("research").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["admin-research"] }); qc.invalidateQueries({ queryKey: ["research-list"] }); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold gradient-text mb-6">Research</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {list.map((r: any) => (
          <div key={r.id} className="glass rounded-2xl overflow-hidden">
            {r.header_image_url && <img src={r.header_image_url} alt="" className="w-full aspect-video object-cover" />}
            <div className="p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.category}</div>
              <h3 className="font-semibold mt-1 line-clamp-2">{r.title}</h3>
              <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{r.description}</p>
              <div className="flex items-center justify-between mt-3 gap-2">
                <Link to="/research/$id" params={{ id: r.id }} className="text-xs text-primary hover:underline">View</Link>
                <button onClick={() => remove(r.id)} className="p-1.5 rounded hover:bg-destructive/20 text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="text-muted-foreground text-sm">No research yet. Click "Add Research" to create one.</p>}
      </div>
    </div>
  );
}
