import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export function ChatWidget() {
  const { user, isAdmin } = useAuth();
  const [unread, setUnread] = useState(0);

  const loadUnread = async () => {
    if (!user) return;
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .is("read_at", null);
    setUnread(count ?? 0);
  };

  useEffect(() => {
    if (!user || isAdmin) return;
    loadUnread();
    const ch = supabase
      .channel(`chat-unread-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => loadUnread())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAdmin]);

  if (!user || isAdmin) return null;

  return (
    <Link
      to="/chat"
      className="fixed right-4 bottom-[6vh] z-40 h-14 w-14 rounded-full gradient-bg text-primary-foreground shadow-lg glow flex items-center justify-center hover:scale-105 transition"
      aria-label="Chat with consultants"
    >
      <MessageCircle className="h-6 w-6" />
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
          {unread}
        </span>
      )}
    </Link>
  );
}
