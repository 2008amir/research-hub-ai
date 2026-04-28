import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/users")({ component: AdminUsers });

function AdminUsers() {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold gradient-text mb-6">Users</h1>
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="glass rounded-xl h-28 animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((u: any) => (
            <Link
              key={u.id}
              to="/admin/users/$userId"
              params={{ userId: u.id }}
              className="glass rounded-xl p-4 hover:ring-1 hover:ring-primary transition block"
            >
              <div className="font-semibold">@{u.username}</div>
              <div className="text-sm text-muted-foreground">{u.first_name} {u.last_name}</div>
              <div className="text-xs text-muted-foreground mt-1">{u.country || "—"}</div>
            </Link>
          ))}
          {users.length === 0 && <p className="text-muted-foreground text-sm">No users yet.</p>}
        </div>
      )}
    </div>
  );
}
