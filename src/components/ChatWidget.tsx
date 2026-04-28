import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

type Msg = {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
};

export function ChatWidget() {
  const { user, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Find an admin to chat with
  useEffect(() => {
    if (!user || isAdmin) return;
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin")
        .limit(1)
        .maybeSingle();
      if (data) setAdminId(data.user_id);
    })();
  }, [user, isAdmin]);

  // Load messages + unread count
  const load = async () => {
    if (!user || !adminId) return;
    const { data } = await supabase
      .from("messages")
      .select("*")
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${adminId}),and(sender_id.eq.${adminId},recipient_id.eq.${user.id})`)
      .order("created_at", { ascending: true });
    setMessages((data ?? []) as Msg[]);
    setUnread((data ?? []).filter((m: any) => m.recipient_id === user.id && !m.read_at).length);
  };

  useEffect(() => {
    load();
    if (!user || !adminId) return;
    const channel = supabase
      .channel(`chat-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `recipient_id=eq.${user.id}` },
        (payload) => {
          const m = payload.new as Msg;
          if (!open && m.sender_id === adminId) {
            toast.message("New message from consultants", {
              description: m.content.slice(0, 80),
              action: { label: "Open", onClick: () => setOpen(true) },
            });
          }
          load();
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, adminId]);

  // Mark read when opening
  useEffect(() => {
    if (!open || !user) return;
    const ids = messages.filter((m) => m.recipient_id === user.id && !m.read_at).map((m) => m.id);
    if (ids.length === 0) return;
    supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", ids).then(() => setUnread(0));
  }, [open, messages, user]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  if (!user || isAdmin) return null;

  const send = async () => {
    if (!text.trim() || !adminId || !user) return;
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      sender_id: user.id,
      recipient_id: adminId,
      content: text.trim(),
    });
    setSending(false);
    if (!error) setText("");
  };

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed right-4 bottom-[6vh] z-40 h-14 w-14 rounded-full gradient-bg text-primary-foreground shadow-lg glow flex items-center justify-center hover:scale-105 transition"
        aria-label="Chat with consultants"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed right-4 bottom-[calc(6vh+72px)] z-40 w-[min(360px,92vw)] h-[460px] glass-strong rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-background/40">
            <div className="font-semibold text-sm">Private chat with consultants</div>
            <div className="text-xs text-muted-foreground">An admin will reply shortly</div>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">Start the conversation 👋</p>
            )}
            {messages.map((m) => {
              const mine = m.sender_id === user.id;
              return (
                <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words",
                    mine ? "gradient-bg text-primary-foreground" : "glass border border-border"
                  )}>
                    {m.content}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="p-2 border-t border-border flex items-end gap-2">
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
              disabled={sending || !text.trim()}
              className="h-9 w-9 shrink-0 rounded-full gradient-bg text-primary-foreground flex items-center justify-center disabled:opacity-50"
              aria-label="Send"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
