import { Check, CheckCheck, Download, FileText, Loader2 } from "lucide-react";
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
  const downloadName = m.file_name ?? "attachment";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words",
          mine ? "gradient-bg text-primary-foreground" : "glass border border-border"
        )}
      >
        {m.file_url && isImage && (
          <div className="mb-1 relative group">
            <a href={m.file_url} target="_blank" rel="noreferrer" className="block">
              <img
                src={m.file_url}
                alt={m.file_name ?? "image"}
                className="rounded-lg max-h-64 object-cover"
              />
            </a>
            <a
              href={m.file_url}
              download={downloadName}
              target="_blank"
              rel="noreferrer"
              className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
              aria-label="Download image"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
        {m.file_url && !isImage && (
          <div
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-lg mb-1",
              mine ? "bg-white/15" : "bg-muted/30"
            )}
          >
            <FileText className="h-4 w-4 shrink-0" />
            <a
              href={m.file_url}
              target="_blank"
              rel="noreferrer"
              className="truncate underline flex-1"
            >
              {m.file_name ?? "Attachment"}
            </a>
            <a
              href={m.file_url}
              download={downloadName}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "h-6 w-6 rounded-full flex items-center justify-center shrink-0",
                mine ? "bg-white/20 hover:bg-white/30" : "bg-muted/50 hover:bg-muted"
              )}
              aria-label="Download file"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          </div>
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
