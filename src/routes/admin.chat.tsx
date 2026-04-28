import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Send, Loader2, ArrowLeft, MessageSquare, Paperclip, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { withSupabaseRetry } from "@/lib/supabase-retry";
import { ChatBubble, type ChatMsg } from "@/components/ChatMessage";
import { toast } from "sonner";

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
      const { data: msgs, error: mErr } = await withSupabaseRetry(() =>
        supabase
          .from("messages")
          .select("sender_id,recipient_id,content,file_name,file_type,read_at,created_at")
          .or(`sender_id.eq.${user!.id},recipient_id.eq.${user!.id}`)
          .order("created_at", { ascending: false }),
        5,
      );
      if (mErr) throw mErr;

      const map = new Map<string, { last: string; unread: number; content: string }>();
      for (const m of msgs ?? []) {
        const other = m.sender_id === user!.id ? m.recipient_id : m.sender_id;
        if (other === user!.id) continue;
        const preview = m.content || (m.file_type?.startsWith("image/") ? "📷 Image" : m.file_name ? `📎 ${m.file_name}` : "");
        const existing = map.get(other);
        if (!existing) {
          map.set(other, {
            last: m.created_at,
            unread: m.recipient_id === user!.id && !m.read_at ? 1 : 0,
            content: preview,
          });
        } else {
          if (m.recipient_id === user!.id && !m.read_at) existing.unread++;
        }
      }
      const ids = Array.from(map.keys());
      if (ids.length === 0) return [] as Conv[];
      const { data: profs } = await withSupabaseRetry(() =>
        supabase
          .from("profiles")
          .select("id,username,first_name,last_name,country,avatar_url")
          .in("id", ids),
      );
      const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return ids.map((id) => {
        const p: any = profMap.get(id) ?? {};
        const meta = map.get(id)!;
        return {
          user_id: id,
          username: p.username ?? "unknown",
          first_name: p.first_name ?? "",
          last_name: p.last_name ?? "",
          country: p.country ?? "",
          avatar_url: p.avatar_url ?? null,
          last_at: meta.last,
          last_content: meta.content,
          unread: meta.unread,
        } as Conv;
      }).sort((a, b) => b.last_at.localeCompare(a.last_at));
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

const PAGE_SIZE = 25;

function ChatPane({ otherId, onBack }: { otherId: string; onBack: () => void }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [other, setOther] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const stickToBottom = useRef(true);

  const mergeMessages = useCallback((incoming: ChatMsg[]) => {
    setMessages((prev) => {
      const map = new Map<string, ChatMsg>();
      for (const m of prev) map.set(m.id, m);
      for (const m of incoming) {
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
      return Array.from(map.values()).sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
  }, []);

  const loadLatest = useCallback(async () => {
    if (!user) return;
    if (otherId === user.id) return;
    const { data, error } = await withSupabaseRetry(() =>
      supabase
        .from("messages")
        .select("*")
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${user.id})`)
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
  }, [user, otherId, mergeMessages]);

  const loadOlder = useCallback(async () => {
    if (!user || loadingMore || !hasMore) return;
    const oldest = messages.find((m) => !m._pending);
    if (!oldest) return;
    setLoadingMore(true);
    const container = scrollRef.current;
    const prevHeight = container?.scrollHeight ?? 0;
    const { data, error } = await withSupabaseRetry(() =>
      supabase
        .from("messages")
        .select("*")
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${user.id})`)
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
    requestAnimationFrame(() => {
      if (container) container.scrollTop = container.scrollHeight - prevHeight;
    });
  }, [user, otherId, loadingMore, hasMore, messages, mergeMessages]);

  useEffect(() => {
    if (!user || otherId === user.id) return;
    (async () => {
      const { data } = await withSupabaseRetry(() => supabase.from("profiles").select("*").eq("id", otherId).maybeSingle());
      setOther(data);
    })();
    loadLatest();
    const interval = setInterval(loadLatest, 4000);
    const ch = supabase
      .channel(`admin-chat-${otherId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => loadLatest())
      .subscribe();
    return () => { supabase.removeChannel(ch); clearInterval(interval); };
  }, [user, otherId, loadLatest]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 60 && hasMore && !loadingMore) loadOlder();
  };

  const send = async () => {
    if ((!text.trim() && !file) || !user || sending) return;
    if (otherId === user.id) {
      toast.error("Choose a user conversation before replying.");
      return;
    }
    setSending(true);
    const content = text.trim() || null;
    const localFile = file;
    setText("");
    setFile(null);
    if (fileInput.current) fileInput.current.value = "";

    let file_url: string | null = null;
    let file_type: string | null = null;
    let file_name: string | null = null;
    if (localFile) {
      const path = `${user.id}/${Date.now()}-${localFile.name}`;
      const up = await supabase.storage.from("chat-files").upload(path, localFile, { contentType: localFile.type });
      if (up.error) {
        toast.error("Upload failed");
        setSending(false);
        setText(content ?? "");
        setFile(localFile);
        return;
      }
      file_url = supabase.storage.from("chat-files").getPublicUrl(path).data.publicUrl;
      file_type = localFile.type;
      file_name = localFile.name;
    }

    const optimistic: ChatMsg = {
      id: `tmp-${Date.now()}`,
      sender_id: user.id,
      // Admin reply ALWAYS routes back to the active thread's user
      recipient_id: otherId,
      content,
      file_url,
      file_type,
      file_name,
      read_at: null,
      created_at: new Date().toISOString(),
      _pending: true,
    };
    stickToBottom.current = true;
    setMessages((prev) => [...prev, optimistic]);

    const { data: inserted, error } = await withSupabaseRetry(
      () =>
        supabase
          .from("messages")
          .insert({
            sender_id: user.id,
            recipient_id: otherId,
            content,
            file_url,
            file_type,
            file_name,
          })
          .select("*")
          .single(),
      5,
    );
    setSending(false);
    if (error || !inserted) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setText(content ?? "");
      if (localFile) setFile(localFile);
      toast.error("Failed to send");
      return;
    }
    setMessages((prev) => {
      const map = new Map(prev.map((m) => [m.id, m]));
      map.delete(optimistic.id);
      map.set((inserted as ChatMsg).id, inserted as ChatMsg);
      return Array.from(map.values()).sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
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
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-4 space-y-2">
        {loadingMore && (
          <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        )}
        {!hasMore && messages.length > 0 && (
          <p className="text-[10px] text-muted-foreground text-center py-1">Beginning of conversation</p>
        )}
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">No messages yet.</p>
        )}
        {messages.map((m) => (
          <ChatBubble key={m.id} m={m} mine={m.sender_id === user?.id} />
        ))}
      </div>
      <div className="p-3 border-t border-border space-y-2">
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
          <button type="button" onClick={() => fileInput.current?.click()}
            className="h-10 w-10 shrink-0 rounded-full glass flex items-center justify-center hover:bg-muted/50">
            <Paperclip className="h-4 w-4" />
          </button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
            placeholder="Reply... (Shift+Enter for newline)"
            className="flex-1 resize-none glass rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring max-h-32"
          />
          <button onClick={send} disabled={sending || (!text.trim() && !file)}
            className="h-10 w-10 shrink-0 rounded-full gradient-bg text-primary-foreground flex items-center justify-center disabled:opacity-50">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
