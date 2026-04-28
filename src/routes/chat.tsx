import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Loader2, ArrowLeft, Paperclip, X } from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { ChatBubble, type ChatMsg } from "@/components/ChatMessage";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { withSupabaseRetry } from "@/lib/supabase-retry";
import { toast } from "sonner";

export const Route = createFileRoute("/chat")({
  component: () => <RequireAuth><ChatPage /></RequireAuth>,
  head: () => ({ meta: [{ title: "Chat with consultants — Ecomedic Squad" }] }),
});

const PAGE_SIZE = 25;

function ChatPage() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [adminId, setAdminId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const stickToBottom = useRef(true);

  // Resolve admin recipient
  useEffect(() => {
    if (!user) return;
    if (isAdmin) {
      navigate({ to: "/admin/chat", replace: true });
      return;
    }
    (async () => {
      const { data, error } = await withSupabaseRetry(() => supabase.rpc("get_any_admin_id"), 5);
      if (error || !data) {
        toast.error("Chat is reconnecting. Please try again in a moment.");
        return;
      }
      if (data === user.id) {
        navigate({ to: "/admin/chat", replace: true });
        return;
      }
      setAdminId(data as string);
    })();
  }, [user, isAdmin, navigate]);

  // Merge incoming messages, dedupe by id, replace optimistic temps
  const mergeMessages = useCallback((incoming: ChatMsg[]) => {
    setMessages((prev) => {
      const map = new Map<string, ChatMsg>();
      for (const m of prev) map.set(m.id, m);
      for (const m of incoming) {
        // If this real message matches an optimistic one, drop the temp
        if (!m.id.startsWith("tmp-")) {
          for (const [k, v] of map) {
            if (
              v._pending &&
              v.sender_id === m.sender_id &&
              v.recipient_id === m.recipient_id &&
              (v.content ?? "") === (m.content ?? "") &&
              (v.file_url ?? "") === (m.file_url ?? "")
            ) {
              map.delete(k);
              break;
            }
          }
        }
        map.set(m.id, { ...(map.get(m.id) ?? {}), ...m });
      }
      return Array.from(map.values()).sort((a, b) =>
        a.created_at.localeCompare(b.created_at)
      );
    });
  }, []);

  // Load latest page + mark unread as read
  const loadLatest = useCallback(async () => {
    if (!user || !adminId) return;
    const { data, error } = await withSupabaseRetry(() =>
      supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${user.id},recipient_id.eq.${adminId}),and(sender_id.eq.${adminId},recipient_id.eq.${user.id})`
        )
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE),
      5,
    );
    if (error) return;
    const list = ((data ?? []) as ChatMsg[]).slice().reverse();
    mergeMessages(list);
    if (list.length < PAGE_SIZE) setHasMore(false);
    const unread = list.filter((m) => m.recipient_id === user.id && !m.read_at).map((m) => m.id);
    if (unread.length) {
      await withSupabaseRetry(() => supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", unread));
    }
  }, [user, adminId, mergeMessages]);

  // Load older
  const loadOlder = useCallback(async () => {
    if (!user || !adminId || loadingMore || !hasMore) return;
    const oldest = messages.find((m) => !m._pending);
    if (!oldest) return;
    setLoadingMore(true);
    const container = scrollRef.current;
    const prevHeight = container?.scrollHeight ?? 0;
    const { data, error } = await withSupabaseRetry(() =>
      supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${user.id},recipient_id.eq.${adminId}),and(sender_id.eq.${adminId},recipient_id.eq.${user.id})`
        )
        .lt("created_at", oldest.created_at)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE),
    );
    if (error) {
      setLoadingMore(false);
      return;
    }
    const list = ((data ?? []) as ChatMsg[]).slice().reverse();
    if (list.length < PAGE_SIZE) setHasMore(false);
    mergeMessages(list);
    setLoadingMore(false);
    // restore scroll position so older content slides in above
    requestAnimationFrame(() => {
      if (container) container.scrollTop = container.scrollHeight - prevHeight;
    });
  }, [user, adminId, loadingMore, hasMore, messages, mergeMessages]);

  useEffect(() => {
    if (!user || !adminId) return;
    loadLatest();
    const interval = setInterval(loadLatest, 4000);
    const ch = supabase
      .channel(`user-chat-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => loadLatest())
      .subscribe();
    return () => { supabase.removeChannel(ch); clearInterval(interval); };
  }, [user, adminId, loadLatest]);

  // Auto-scroll to bottom on new messages, only if user was already at bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Track scroll to update stickiness + trigger pagination
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 60 && hasMore && !loadingMore) loadOlder();
  };

  const send = async () => {
    if ((!text.trim() && !file) || !adminId || !user) return;
    if (adminId === user.id) {
      navigate({ to: "/admin/chat", replace: true });
      return;
    }
    const content = text.trim() || null;
    const localFile = file;
    // Clear input immediately — fire-and-forget UX
    setText("");
    setFile(null);
    if (fileInput.current) fileInput.current.value = "";

    const optimistic: ChatMsg = {
      id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sender_id: user.id,
      recipient_id: adminId,
      content,
      file_url: null,
      file_type: localFile?.type ?? null,
      file_name: localFile?.name ?? null,
      read_at: null,
      created_at: new Date().toISOString(),
      _pending: true,
    };
    stickToBottom.current = true;
    setMessages((prev) => [...prev, optimistic]);

    // Background delivery — never blocks the UI
    (async () => {
      let file_url: string | null = null;
      let file_type: string | null = localFile?.type ?? null;
      let file_name: string | null = localFile?.name ?? null;

      if (localFile) {
        const path = `${user.id}/${Date.now()}-${localFile.name}`;
        const up = await supabase.storage.from("chat-files").upload(path, localFile, { contentType: localFile.type });
        if (up.error) {
          setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
          toast.error("Upload failed");
          return;
        }
        file_url = supabase.storage.from("chat-files").getPublicUrl(path).data.publicUrl;
      }

      // Retry insert in the background until the backend accepts it
      const maxAttempts = 12;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const { data: inserted, error } = await withSupabaseRetry(
          () =>
            supabase
              .from("messages")
              .insert({
                sender_id: user.id,
                recipient_id: adminId,
                content,
                file_url,
                file_type,
                file_name,
              })
              .select("*")
              .single(),
          3,
        );
        if (!error && inserted) {
          setMessages((prev) => {
            const map = new Map(prev.map((m) => [m.id, m]));
            map.delete(optimistic.id);
            map.set((inserted as ChatMsg).id, inserted as ChatMsg);
            return Array.from(map.values()).sort((a, b) => a.created_at.localeCompare(b.created_at));
          });
          return;
        }
        // backoff before retrying
        await new Promise((r) => setTimeout(r, Math.min(500 * attempt, 4000)));
      }
      // After all attempts failed, drop the optimistic message and warn
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      toast.error("Couldn't deliver your message. Please try again.");
    })();
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

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-4 space-y-2 container mx-auto max-w-3xl w-full">
        {isAdmin && (
          <div className="text-xs text-center py-3 px-3 rounded-lg glass border border-border">
            You're signed in as an admin. Use the <Link to="/admin/chat" className="underline font-medium">admin chat panel</Link> to reply to users.
          </div>
        )}
        {!adminId && !isAdmin && <p className="text-xs text-muted-foreground text-center py-8">Connecting…</p>}
        {adminId && loadingMore && (
          <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        )}
        {adminId && !hasMore && messages.length > 0 && (
          <p className="text-[10px] text-muted-foreground text-center py-1">Beginning of conversation</p>
        )}
        {adminId && messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">Start the conversation 👋</p>
        )}
        {messages.map((m) => (
          <ChatBubble key={m.id} m={m} mine={m.sender_id === user?.id} />
        ))}
      </div>

      <div className="sticky bottom-0 glass-strong border-t border-border">
        <div className="container mx-auto max-w-3xl p-3 space-y-2">
          {file && (
            <div className="flex items-center gap-2 text-xs glass rounded-lg px-2 py-1.5">
              {file.type.startsWith("image/") ? (
                <img src={URL.createObjectURL(file)} alt="preview" className="h-10 w-10 object-cover rounded" />
              ) : (
                <Paperclip className="h-3.5 w-3.5" />
              )}
              <span className="truncate flex-1">{file.name}</span>
              <button onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ""; }}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/*,application/pdf"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 10 * 1024 * 1024) { toast.error("Max 10MB"); return; }
                setFile(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="h-10 w-10 shrink-0 rounded-full glass flex items-center justify-center hover:bg-muted/50"
              aria-label="Attach"
            >
              <Paperclip className="h-4 w-4" />
            </button>
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
              disabled={(!text.trim() && !file) || !adminId}
              className="h-10 w-10 shrink-0 rounded-full gradient-bg text-primary-foreground flex items-center justify-center disabled:opacity-50"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
