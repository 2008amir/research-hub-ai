import { Check, CheckCheck, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChatMsg = {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string | null;
  file_url: string | null;
  file_type: string | null;
  file_name: string | null;
  read_at: string | null;
  created_at: string;
  _pending?: boolean;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${time}`;
}

export function ChatBubble({ m, mine }: { m: ChatMsg; mine: boolean }) {
  const isImage = m.file_type?.startsWith("image/");
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words",
          mine ? "gradient-bg text-primary-foreground" : "glass border border-border"
        )}
      >
        {m.file_url && isImage && (
          <a href={m.file_url} target="_blank" rel="noreferrer" className="block mb-1">
            <img src={m.file_url} alt={m.file_name ?? "image"} className="rounded-lg max-h-64 object-cover" />
          </a>
        )}
        {m.file_url && !isImage && (
          <a
            href={m.file_url}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-lg mb-1",
              mine ? "bg-white/15" : "bg-muted/30"
            )}
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span className="truncate underline">{m.file_name ?? "Attachment"}</span>
          </a>
        )}
        {m.content && <div>{m.content}</div>}
        <div className={cn("text-[10px] mt-1 opacity-70 flex items-center gap-1", mine ? "justify-end" : "justify-start")}>
          <span>{formatTime(m.created_at)}</span>
          {mine && (
            m._pending ? <Loader2 className="h-3 w-3 animate-spin" />
              : m.read_at ? <CheckCheck className="h-3 w-3" />
              : <Check className="h-3 w-3" />
          )}
        </div>
      </div>
    </div>
  );
}
