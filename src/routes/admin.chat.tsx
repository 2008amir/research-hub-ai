import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Send, Loader2, ArrowLeft, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/chat")({ component: AdminChat });

type Conv = {
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  country: string;
  avatar_url: string | null;
  last_at: string;
  last_content: string;
  unread: number;
};

function AdminChat() {
  const { user } = useAuth();
  const [active, setActive] = useState<string | null>(null);

  const { data: convs = [], refetch, isLoading, error } = useQuery({
    queryKey: ["admin-convs", user?.id],
    enabled: !!user,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data: msgs, error: mErr } = await supabase
        .from("messages")
        .select("sender_id,recipient_id,content,read_at,created_at")
        .or(`sender_id.eq.${user!.id},recipient_id.eq.${user!.id}`)
        .order("created_at", { ascending: false });
      if (mErr) throw mErr;

      const map = new Map<string, { last: string; unread: number; content: string }>();
      for (const m of msgs ?? []) {
        const other = m.sender_id === user!.id ? m.recipient_id : m.sender_id;
        const existing = map.get(other);
        if (!existing) {
          map.set(other, {
            last: m.created_at,
            unread: m.recipient_id === user!.id && !m.read_at ? 1 : 0,
            content: m.content,
          });
        } else {
          if (m.recipient_id === user!.id && !m.read_at) existing.unread++;
        }
      }
      const ids = Array.from(map.keys());
      if (ids.length === 0) return [] as Conv[];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,username,first_name,last_name,country,avatar_url")
        .in("id", ids);
      return (profs ?? []).map((p: any) => ({
        user_id: p.id,
        username: p.username,
        first_name: p.first_name,
        last_name: p.last_name,
        country: p.country,
        avatar_url: p.avatar_url,
        last_at: map.get(p.id)!.last,
        last_content: map.get(p.id)!.content,
        unread: map.get(p.id)!.unread,
      })).sort((a, b) => b.last_at.localeCompare(a.last_at)) as Conv[];
    },
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("admin-chat-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, refetch]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold gradient-text">Chat</h1>
        {!active && (
          <span className="text-xs text-muted-foreground">{convs.length} conversation{convs.length === 1 ? "" : "s"}</span>
        )}
      </div>
      {active ? (
        <ChatPane otherId={active} onBack={() => { setActive(null); refetch(); }} />
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">Failed to load conversations.</p>
      ) : convs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No conversations yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {convs.map((c) => (
            <button key={c.user_id} onClick={() => setActive(c.user_id)}
              className="glass rounded-xl p-4 text-left hover:glow transition relative">
              {c.unread > 0 && (
                <span className="absolute top-3 right-3 h-5 min-w-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                  {c.unread}
                </span>
              )}
              <div className="font-semibold">@{c.username}</div>
              <div className="text-sm text-muted-foreground">{c.first_name} {c.last_name}</div>
              <div className="text-xs text-muted-foreground mt-1">{c.country || "—"}</div>
              <div className="text-xs text-foreground/70 mt-2 line-clamp-1">{c.last_content}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{new Date(c.last_at).toLocaleString()}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ChatPane({ otherId, onBack }: { otherId: string; onBack: () => void }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [other, setOther] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("messages")
      .select("*")
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${user.id})`)
      .order("created_at", { ascending: true });
    setMessages(data ?? []);
    const unreadIds = (data ?? []).filter((m: any) => m.recipient_id === user.id && !m.read_at).map((m: any) => m.id);
    if (unreadIds.length) {
      await supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", unreadIds);
    }
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", otherId).maybeSingle();
      setOther(data);
    })();
    load();
    const interval = setInterval(load, 4000);
    const ch = supabase
      .channel(`admin-chat-${otherId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherId]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);

  const send = async () => {
    if (!text.trim() || !user) return;
    setSending(true);
    const content = text.trim();
    setText("");
    const { error } = await supabase.from("messages").insert({ sender_id: user.id, recipient_id: otherId, content });
    setSending(false);
    if (error) {
      setText(content);
      return;
    }
    load();
  };

  return (
    <div className="glass-strong rounded-2xl overflow-hidden flex flex-col h-[70vh] max-w-3xl">
      <div className="px-4 py-3 border-b border-border flex items-center gap-3 bg-background/40">
        <button onClick={onBack} className="p-1 rounded-md hover:bg-muted/50"><ArrowLeft className="h-4 w-4" /></button>
        <div>
          <div className="font-semibold text-sm">@{other?.username ?? "—"}</div>
          <div className="text-xs text-muted-foreground">{other?.first_name} {other?.last_name} · {other?.country || "—"}</div>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">No messages yet.</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === user?.id;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[75%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words",
                mine ? "gradient-bg text-primary-foreground" : "glass border border-border"
              )}>
                {m.content}
                <div className={cn("text-[9px] mt-1 opacity-60", mine ? "text-right" : "text-left")}>
                  {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="p-3 border-t border-border flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          rows={1}
          placeholder="Reply... (Shift+Enter for newline)"
          className="flex-1 resize-none glass rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring max-h-32"
        />
        <button onClick={send} disabled={sending || !text.trim()}
          className="h-10 w-10 shrink-0 rounded-full gradient-bg text-primary-foreground flex items-center justify-center disabled:opacity-50">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
