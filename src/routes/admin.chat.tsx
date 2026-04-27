import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Send, Loader2, ArrowLeft } from "lucide-react";
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
  unread: number;
};

function AdminChat() {
  const { user } = useAuth();
  const [active, setActive] = useState<string | null>(null);

  const { data: convs = [], refetch } = useQuery({
    queryKey: ["admin-convs", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: msgs } = await supabase
        .from("messages")
        .select("sender_id,recipient_id,read_at,created_at")
        .or(`sender_id.eq.${user!.id},recipient_id.eq.${user!.id}`)
        .order("created_at", { ascending: false });

      const map = new Map<string, { last: string; unread: number }>();
      for (const m of msgs ?? []) {
        const other = m.sender_id === user!.id ? m.recipient_id : m.sender_id;
        const existing = map.get(other) ?? { last: m.created_at, unread: 0 };
        if (m.recipient_id === user!.id && !m.read_at) existing.unread++;
        map.set(other, existing);
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
      <h1 className="text-2xl font-bold gradient-text mb-6">Chat</h1>
      {active ? (
        <ChatPane otherId={active} onBack={() => { setActive(null); refetch(); }} />
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
            </button>
          ))}
          {convs.length === 0 && (
            <p className="text-muted-foreground text-sm">No conversations yet.</p>
          )}
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
    const ch = supabase
      .channel(`admin-chat-${otherId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherId]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);

  const send = async () => {
    if (!text.trim() || !user) return;
    setSending(true);
    await supabase.from("messages").insert({ sender_id: user.id, recipient_id: otherId, content: text.trim() });
    setSending(false);
    setText("");
  };

  return (
    <div className="glass-strong rounded-2xl overflow-hidden flex flex-col h-[70vh] max-w-3xl">
      <div className="px-4 py-3 border-b border-border flex items-center gap-3 bg-background/40">
        <button onClick={onBack} className="p-1 rounded-md hover:bg-muted/50"><ArrowLeft className="h-4 w-4" /></button>
        <div>
          <div className="font-semibold text-sm">@{other?.username ?? "—"}</div>
          <div className="text-xs text-muted-foreground">{other?.first_name} {other?.last_name}</div>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map((m) => {
          const mine = m.sender_id === user?.id;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[75%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words",
                mine ? "gradient-bg text-primary-foreground" : "glass border border-border"
              )}>{m.content}</div>
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
