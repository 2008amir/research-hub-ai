import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Heart, MessageCircle, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/admin/users/$userId")({ component: UserDetail });

function UserDetail() {
  const { userId } = Route.useParams();
  const [showComments, setShowComments] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-user-detail", userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_user_detail" as never, { _user_id: userId } as never);
      if (error) throw error;
      return data as any;
    },
  });

  if (isLoading) return <div className="glass rounded-xl h-40 animate-pulse" />;
  if (!data?.profile) return <div className="text-muted-foreground">User not found.</div>;

  const p = data.profile;
  const comments = data.comments ?? [];

  return (
    <div className="space-y-6">
      <Link to="/admin/users" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to users
      </Link>

      <div className="glass-strong rounded-2xl p-6 flex items-center gap-4">
        {p.avatar_url ? (
          <img src={p.avatar_url} alt={p.username} className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="h-16 w-16 rounded-full gradient-bg flex items-center justify-center text-xl font-bold text-primary-foreground">
            {(p.username ?? "?")[0]?.toUpperCase()}
          </div>
        )}
        <div>
          <div className="text-xl font-bold">@{p.username}</div>
          <div className="text-sm text-muted-foreground">{p.first_name} {p.last_name}</div>
          <div className="text-xs text-muted-foreground">{p.country || "—"}{p.phone ? ` • ${p.phone}` : ""}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="glass-strong rounded-2xl p-5">
          <Heart className="h-5 w-5 text-primary mb-2" />
          <div className="text-2xl font-bold">{data.totalLikes ?? 0}</div>
          <div className="text-xs text-muted-foreground">Total likes</div>
        </div>
        <button onClick={() => setShowComments((v) => !v)} className="glass-strong rounded-2xl p-5 text-left hover:ring-1 hover:ring-primary transition">
          <MessageCircle className="h-5 w-5 text-primary mb-2" />
          <div className="text-2xl font-bold">{data.totalComments ?? 0}</div>
          <div className="text-xs text-muted-foreground">Total comments {showComments ? "(hide)" : "(view)"}</div>
        </button>
      </div>

      {showComments && (
        <div className="glass-strong rounded-2xl p-5 space-y-3">
          <div className="text-sm font-semibold">All comments</div>
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No comments yet.</p>
          ) : (
            comments.map((c: any) => (
              <div key={c.id} className="border border-border rounded-xl p-3">
                <div className="text-sm">{c.content}</div>
                <div className="text-xs text-muted-foreground mt-2 flex items-center justify-between">
                  <span>On: {c.research_title ?? c.research_id}</span>
                  <span>{new Date(c.created_at).toLocaleString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
