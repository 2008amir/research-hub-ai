import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Heart, Send, ArrowLeft, Loader2 } from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/research/$id")({
  component: () => <RequireAuth><ResearchDetail /></RequireAuth>,
});

function ResearchDetail() {
  const { id } = Route.useParams();
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["research", id],
    queryFn: async () => {
      const { data: r, error } = await supabase.from("research").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return r;
    },
  });

  const { data: likes = [] } = useQuery({
    queryKey: ["likes", id],
    queryFn: async () => {
      const { data } = await supabase.from("likes").select("user_id").eq("research_id", id);
      return data ?? [];
    },
  });
  const liked = !!user && likes.some((l: any) => l.user_id === user.id);

  const { data: comments = [] } = useQuery({
    queryKey: ["comments", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("comments")
        .select("id, content, created_at, user_id, profiles:user_id(username, first_name, last_name, avatar_url), comment_likes(user_id)")
        .eq("research_id", id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const toggleLike = async () => {
    if (!user) return;
    if (liked) {
      await supabase.from("likes").delete().eq("user_id", user.id).eq("research_id", id);
    } else {
      await supabase.from("likes").insert({ user_id: user.id, research_id: id });
    }
    qc.invalidateQueries({ queryKey: ["likes", id] });
  };

  const submitComment = async () => {
    const text = comment.trim();
    if (!text || !user) return;
    setSubmitting(true);
    const { error } = await supabase.from("comments").insert({ user_id: user.id, research_id: id, content: text });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    setComment("");
    qc.invalidateQueries({ queryKey: ["comments", id] });
  };

  const toggleCommentLike = async (commentId: string, currentlyLiked: boolean) => {
    if (!user) return;
    if (currentlyLiked) {
      await supabase.from("comment_likes").delete().eq("user_id", user.id).eq("comment_id", commentId);
    } else {
      await supabase.from("comment_likes").insert({ user_id: user.id, comment_id: commentId });
    }
    qc.invalidateQueries({ queryKey: ["comments", id] });
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass-strong rounded-2xl p-8 text-center">
          <h2 className="text-xl font-semibold">Research not found</h2>
          <Link to="/dashboard" className="mt-4 inline-block text-primary hover:underline">Back to dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <TopBar search={search} onSearchChange={setSearch} homeTo="/dashboard" profileTo="/profile" />
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <article className="glass-strong rounded-2xl overflow-hidden">
          {data.header_image_url && (
            <img src={data.header_image_url} alt={data.title} className="w-full aspect-video object-cover" />
          )}
          <div className="p-6 md:p-8">
            <span className="text-[10px] uppercase tracking-wider gradient-bg text-primary-foreground px-2 py-1 rounded-full font-semibold">
              {data.category}
            </span>
            <h1 className="mt-3 text-3xl md:text-4xl font-bold">{data.title}</h1>
            <p className="mt-3 text-muted-foreground">{data.description}</p>
            <div className="prose prose-invert max-w-none mt-6 text-foreground"
              dangerouslySetInnerHTML={{ __html: data.content_html || "" }} />
          </div>
        </article>

        {/* Interaction bar */}
        <div className="mt-6 glass-strong rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleLike}
              className={cn(
                "h-10 w-10 rounded-full border flex items-center justify-center transition-all shrink-0",
                liked ? "bg-destructive/20 border-destructive text-destructive" : "border-border hover:bg-muted/50 text-muted-foreground"
              )}
              aria-label={liked ? "Unlike" : "Like"}
            >
              <Heart className={cn("h-5 w-5", liked && "fill-current")} />
            </button>
            <span className="text-sm font-medium">{likes.length}</span>

            <div className="flex-1 relative">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment..."
                rows={1}
                className="w-full glass rounded-xl px-4 py-2.5 pr-12 resize-none text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[42px] max-h-32"
              />
              <button
                onClick={submitComment}
                disabled={submitting || !comment.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full gradient-bg text-primary-foreground flex items-center justify-center disabled:opacity-40"
                aria-label="Send comment"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Comments */}
        <section className="mt-6 space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">{comments.length} Comments</h2>
          {comments.map((c: any) => {
            const cliked = !!user && c.comment_likes?.some((l: any) => l.user_id === user.id);
            return (
              <div key={c.id} className="glass rounded-xl p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-sm font-semibold">
                    {c.profiles?.first_name} {c.profiles?.last_name}
                    <span className="text-muted-foreground font-normal ml-2">@{c.profiles?.username}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{c.content}</p>
                <button
                  onClick={() => toggleCommentLike(c.id, cliked)}
                  className={cn(
                    "mt-2 inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border transition",
                    cliked ? "bg-destructive/20 border-destructive text-destructive" : "border-border text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  <Heart className={cn("h-3 w-3", cliked && "fill-current")} />
                  {c.comment_likes?.length ?? 0}
                </button>
              </div>
            );
          })}
          {comments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Be the first to comment!</p>
          )}
        </section>
      </main>
    </div>
  );
}
