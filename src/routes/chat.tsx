import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Send, Loader2, ArrowLeft } from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/chat")({
  component: () => <RequireAuth><ChatPage /></RequireAuth>,
  head: () => ({ meta: [{ title: "Chat with consultants — Ecomedic Squad" }] }),
});

type Msg = {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
};

function ChatPage() {
  const { user } = useAuth();
  const [adminId, setAdminId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin")
        .limit(1)
        .maybeSingle();
      if (data) setAdminId(data.user_id);
    })();
  }, [user]);

  const load = async () => {
    if (!user || !adminId) return;
    const { data } = await supabase
      .from("messages")
      .select("*")
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${adminId}),and(sender_id.eq.${adminId},recipient_id.eq.${user.id})`)
      .order("created_at", { ascending: true });
    setMessages((data ?? []) as Msg[]);
    const unreadIds = (data ?? []).filter((m: any) => m.recipient_id === user.id && !m.read_at).map((m: any) => m.id);
    if (unreadIds.length) {
      await supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", unreadIds);
    }
  };

  useEffect(() => {
    load();
    if (!user || !adminId) return;
    const ch = supabase
      .channel(`user-chat-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, adminId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = async () => {
    if (!text.trim() || !adminId || !user) return;
    setSending(true);
    await supabase.from("messages").insert({
      sender_id: user.id,
      recipient_id: adminId,
      content: text.trim(),
    });
    setSending(false);
    setText("");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 glass-strong border-b border-border">
        <div className="container mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/dashboard" className="p-2 rounded-md hover:bg-muted/50">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="font-semibold text-sm">Private chat with consultants</div>
            <div className="text-xs text-muted-foreground">Live — replies appear instantly</div>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 container mx-auto max-w-3xl w-full">
        {!adminId && (
          <p className="text-xs text-muted-foreground text-center py-8">Connecting…</p>
        )}
        {adminId && messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">Start the conversation 👋</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === user?.id;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words",
                mine ? "gradient-bg text-primary-foreground" : "glass border border-border"
              )}>{m.content}</div>
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-0 glass-strong border-t border-border">
        <div className="container mx-auto max-w-3xl p-3 flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Type a message... (Shift+Enter for newline)"
            rows={1}
            className="flex-1 resize-none glass rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring max-h-32"
          />
          <button
            onClick={send}
            disabled={sending || !text.trim() || !adminId}
            className="h-10 w-10 shrink-0 rounded-full gradient-bg text-primary-foreground flex items-center justify-center disabled:opacity-50"
            aria-label="Send"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
