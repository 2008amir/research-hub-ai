import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Youtube from "@tiptap/extension-youtube";
import { Node as TiptapNode, mergeAttributes } from "@tiptap/core";
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Bold, Italic, Underline as UnderlineIcon, Heading1, Heading2, Heading3, List, ListOrdered,
  Link as LinkIcon, Image as ImageIcon, Quote, Undo, Redo, AlignLeft, AlignCenter,
  AlignRight, AlignJustify, Code2, Eye, Video, Upload, Loader2, X, Highlighter, Type,
  Maximize2, Minimize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

/* ---------- Custom video node (handles direct mp4 + vimeo iframe) ---------- */
const VideoEmbed = TiptapNode.create({
  name: "videoEmbed",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: "" },
      provider: { default: "file" },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-video-embed]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const { src, provider } = HTMLAttributes;
    if (provider === "vimeo") {
      return [
        "div",
        { "data-video-embed": "true", "data-provider": "vimeo", class: "video-embed" },
        ["iframe", { src, frameborder: "0", allow: "autoplay; fullscreen; picture-in-picture", allowfullscreen: "true" }],
      ];
    }
    return [
      "div",
      { "data-video-embed": "true", "data-provider": "file", class: "video-embed" },
      ["video", mergeAttributes({ src, controls: "true", playsinline: "true" })],
    ];
  },
});

/* ---------- Helpers ---------- */
function vimeoEmbed(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  return m ? `https://player.vimeo.com/video/${m[1]}` : null;
}
function isYoutube(url: string) {
  return /(?:youtube\.com|youtu\.be)/i.test(url);
}

async function uploadWithRetry(bucket: string, path: string, file: File, contentType: string, attempts = 3) {
  let lastErr: any = null;
  for (let i = 0; i < attempts; i++) {
    const { error } = await supabase.storage.from(bucket).upload(path, file, { cacheControl: "3600", contentType });
    if (!error) return null;
    lastErr = error;
    const msg = (error.message || "").toLowerCase();
    const transient = msg.includes("08p01") || msg.includes("database") || msg.includes("recovery") || msg.includes("connection") || msg.includes("503");
    if (!transient) break;
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  return lastErr;
}

/* ---------- Modal ---------- */
function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="glass-strong rounded-2xl p-5 w-full max-w-md border border-border" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted/50" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- Fonts ---------- */
const FONTS = [
  "Inter", "Arial", "Helvetica", "Verdana", "Tahoma", "Trebuchet MS",
  "Times New Roman", "Georgia", "Garamond", "Palatino", "Courier New", "Lucida Console",
  "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Playfair Display", "Merriweather", "Raleway",
];

type Props = { value: string; onChange: (html: string) => void };

export function RichEditor({ value, onChange }: Props) {
  const { user } = useAuth();
  const [showHtml, setShowHtml] = useState(false);
  const [htmlBuffer, setHtmlBuffer] = useState(value);
  const [imgModal, setImgModal] = useState<null | "menu" | "link" | "upload">(null);
  const [vidModal, setVidModal] = useState<null | "menu" | "link" | "upload">(null);
  const [linkModal, setLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // Selection style inputs
  const [selStyle, setSelStyle] = useState({ width: "", height: "", lineHeight: "", letterSpacing: "" });

  const fileImgRef = useRef<HTMLInputElement>(null);
  const fileVidRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit, // includes heading 1-6, lists, link, underline, blockquote, code, history…
      TextStyle,
      Color,
      FontFamily.configure({ types: ["textStyle"] }),
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph", "image"], alignments: ["left", "center", "right", "justify"] }),
      Image.configure({ inline: false, allowBase64: false, HTMLAttributes: { class: "rich-image" } }),
      Youtube.configure({ controls: true, nocookie: true, HTMLAttributes: { class: "video-embed-youtube" } }),
      VideoEmbed,
    ] as any,
    content: value,
    editorProps: {
      attributes: {
        class: "prose max-w-none min-h-[300px] focus:outline-none p-4 rich-editor-content rich-editor-light",
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html);
      setHtmlBuffer(html);
    },
    onSelectionUpdate: () => readSelectionStyle(),
    immediatelyRender: false,
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML() && !showHtml) {
      editor.commands.setContent(value || "", { emitUpdate: false });
      setHtmlBuffer(value || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  const readSelectionStyle = useCallback(() => {
    if (typeof window === "undefined") return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    let node: Node | null = sel.anchorNode;
    while (node && node.nodeType !== 1) node = node.parentNode;
    if (!node) return;
    const cs = window.getComputedStyle(node as Element);
    setSelStyle({
      width: (node as HTMLElement).style?.width || "",
      height: (node as HTMLElement).style?.height || "",
      lineHeight: (node as HTMLElement).style?.lineHeight || cs.lineHeight || "",
      letterSpacing: (node as HTMLElement).style?.letterSpacing || cs.letterSpacing || "",
    });
  }, []);

  if (!editor) return <div className="glass rounded-xl h-80 animate-pulse" />;

  const uploadToBucket = async (file: File, kind: "image" | "video") => {
    if (!user) { toast.error("Sign in required"); return null; }
    const max = kind === "image" ? 10 : 100;
    if (file.size > max * 1024 * 1024) { toast.error(`Max ${max}MB`); return null; }
    const ext = file.name.split(".").pop() || (kind === "image" ? "png" : "mp4");
    const path = `${user.id}/${kind}/${Date.now()}.${ext}`;
    const err = await uploadWithRetry("research-media", path, file, file.type);
    if (err) { toast.error(err.message || "Upload failed"); return null; }
    const { data } = supabase.storage.from("research-media").getPublicUrl(path);
    return data.publicUrl;
  };

  const insertImage = (url: string) => {
    editor.chain().focus().setImage({ src: url }).run();
    setImgModal(null); setLinkUrl("");
  };

  const insertVideo = (url: string, source: "file" | "link") => {
    if (source === "link") {
      if (isYoutube(url)) {
        (editor.chain().focus() as any).setYoutubeVideo({ src: url, width: 640, height: 360 }).run();
      } else {
        const vimeo = vimeoEmbed(url);
        if (vimeo) editor.chain().focus().insertContent({ type: "videoEmbed", attrs: { src: vimeo, provider: "vimeo" } }).run();
        else editor.chain().focus().insertContent({ type: "videoEmbed", attrs: { src: url, provider: "file" } }).run();
      }
    } else {
      editor.chain().focus().insertContent({ type: "videoEmbed", attrs: { src: url, provider: "file" } }).run();
    }
    setVidModal(null); setLinkUrl("");
  };

  const onImgFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setUploading(true);
    const url = await uploadToBucket(f, "image");
    setUploading(false);
    if (url) insertImage(url);
    e.target.value = "";
  };
  const onVidFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setUploading(true);
    const url = await uploadToBucket(f, "video");
    setUploading(false);
    if (url) insertVideo(url, "file");
    e.target.value = "";
  };

  const openLinkModal = () => {
    const sel = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(sel.from, sel.to, " ");
    setLinkLabel(selectedText || "");
    setLinkUrl("");
    setLinkModal(true);
  };

  const submitLink = () => {
    if (!linkUrl) return;
    const label = linkLabel.trim() || linkUrl;
    // Replace selection with: <a href=url>label</a> then on a new line print the url under it
    const sel = editor.state.selection;
    const chain = editor.chain().focus();
    if (sel.empty) {
      chain.insertContent(`<a href="${linkUrl}" target="_blank" rel="noopener noreferrer">${label}</a><br><span class="link-url-below">${linkUrl}</span>`).run();
    } else {
      chain.deleteSelection()
        .insertContent(`<a href="${linkUrl}" target="_blank" rel="noopener noreferrer">${label}</a><br><span class="link-url-below">${linkUrl}</span>`)
        .run();
    }
    setLinkModal(false);
    setLinkUrl(""); setLinkLabel("");
  };

  // Apply inline style to current selection (uses TextStyle mark for color-style props)
  const applyInlineStyle = (prop: "lineHeight" | "letterSpacing" | "width" | "height", val: string) => {
    if (typeof window === "undefined") return;
    setSelStyle((s) => ({ ...s, [prop]: val }));
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) {
      // apply to nearest block element
      let node: Node | null = sel.anchorNode;
      while (node && node.nodeType !== 1) node = node.parentNode;
      if (node) (node as HTMLElement).style.setProperty(prop === "lineHeight" ? "line-height" : prop === "letterSpacing" ? "letter-spacing" : prop, val);
    } else {
      const span = document.createElement("span");
      span.style.setProperty(prop === "lineHeight" ? "line-height" : prop === "letterSpacing" ? "letter-spacing" : prop, val);
      try {
        const contents = range.extractContents();
        span.appendChild(contents);
        range.insertNode(span);
      } catch { /* ignore */ }
    }
    onChange(editor.getHTML());
    setHtmlBuffer(editor.getHTML());
  };

  const Btn = ({ on, active, children, label, disabled }: { on: () => void; active?: boolean; children: React.ReactNode; label: string; disabled?: boolean }) => (
    <button type="button" onClick={on} aria-label={label} title={label} disabled={disabled}
      className={cn("p-2 rounded-md hover:bg-muted/50 transition disabled:opacity-40", active && "bg-primary/20 text-primary")}>
      {children}
    </button>
  );

  return (
    <div className={cn(
      "glass rounded-xl overflow-hidden border border-border",
      fullscreen && "fixed inset-0 z-[150] rounded-none flex flex-col bg-background"
    )}>
      {/* Top action bar with fullscreen */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/10">
        <span className="text-xs text-muted-foreground font-medium">Content editor</span>
        <button
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-muted/50 transition"
        >
          {fullscreen ? <><Minimize2 className="h-3.5 w-3.5" /> Minimize</> : <><Maximize2 className="h-3.5 w-3.5" /> Full page</>}
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-2 border-b border-border bg-muted/20">
        {!showHtml && (
          <>
            <Btn label="Bold" on={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}><Bold className="h-4 w-4" /></Btn>
            <Btn label="Italic" on={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}><Italic className="h-4 w-4" /></Btn>
            <Btn label="Underline" on={() => (editor.chain().focus() as any).toggleUnderline().run()} active={editor.isActive("underline")}><UnderlineIcon className="h-4 w-4" /></Btn>
            <div className="w-px h-5 bg-border mx-1" />
            <Btn label="Heading 1" on={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })}><Heading1 className="h-4 w-4" /></Btn>
            <Btn label="Heading 2" on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })}><Heading2 className="h-4 w-4" /></Btn>
            <Btn label="Heading 3" on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })}><Heading3 className="h-4 w-4" /></Btn>
            <Btn label="Bullet list" on={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}><List className="h-4 w-4" /></Btn>
            <Btn label="Numbered list" on={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}><ListOrdered className="h-4 w-4" /></Btn>
            <Btn label="Quote" on={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")}><Quote className="h-4 w-4" /></Btn>

            <div className="w-px h-5 bg-border mx-1" />
            <Btn label="Align left" on={() => (editor.chain().focus() as any).setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })}><AlignLeft className="h-4 w-4" /></Btn>
            <Btn label="Align center" on={() => (editor.chain().focus() as any).setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })}><AlignCenter className="h-4 w-4" /></Btn>
            <Btn label="Align right" on={() => (editor.chain().focus() as any).setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })}><AlignRight className="h-4 w-4" /></Btn>
            <Btn label="Justify" on={() => (editor.chain().focus() as any).setTextAlign("justify").run()} active={editor.isActive({ textAlign: "justify" })}><AlignJustify className="h-4 w-4" /></Btn>

            <div className="w-px h-5 bg-border mx-1" />
            {/* Font family — 40% width on the toolbar row */}
            <div className="inline-flex items-center gap-1 basis-[40%] min-w-[160px] max-w-[40%]">
              <Type className="h-4 w-4 text-muted-foreground shrink-0" />
              <select
                aria-label="Font"
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) editor.chain().focus().setFontFamily(v).run();
                  else editor.chain().focus().unsetFontFamily().run();
                }}
                className="w-full bg-background text-foreground text-xs rounded border border-border px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                defaultValue=""
              >
                <option value="" style={{ fontFamily: "inherit" }}>Font…</option>
                {FONTS.map(f => (
                  <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                ))}
              </select>
            </div>

            {/* Text color */}
            <label className="inline-flex items-center gap-1 text-xs cursor-pointer" title="Text color">
              <span className="text-muted-foreground">A</span>
              <input type="color" onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
                className="h-6 w-6 rounded cursor-pointer bg-transparent border border-border" aria-label="Text color" />
            </label>

            {/* Highlight color */}
            <label className="inline-flex items-center gap-1 text-xs cursor-pointer" title="Highlight">
              <Highlighter className="h-4 w-4 text-muted-foreground" />
              <input type="color" onChange={(e) => (editor.chain().focus() as any).toggleHighlight({ color: e.target.value }).run()}
                className="h-6 w-6 rounded cursor-pointer bg-transparent border border-border" aria-label="Highlight color" />
            </label>

            <div className="w-px h-5 bg-border mx-1" />
            <Btn label="Insert link" on={openLinkModal}><LinkIcon className="h-4 w-4" /></Btn>
            <Btn label="Insert image" on={() => setImgModal("menu")}><ImageIcon className="h-4 w-4" /></Btn>
            <Btn label="Insert video" on={() => setVidModal("menu")}><Video className="h-4 w-4" /></Btn>

            <div className="w-px h-5 bg-border mx-1" />
            <Btn label="Undo" on={() => editor.chain().focus().undo().run()}><Undo className="h-4 w-4" /></Btn>
            <Btn label="Redo" on={() => editor.chain().focus().redo().run()}><Redo className="h-4 w-4" /></Btn>
          </>
        )}

        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            if (showHtml) editor.commands.setContent(htmlBuffer || "", { emitUpdate: true });
            setShowHtml((s) => !s);
          }}
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border transition",
            showHtml ? "bg-primary/20 text-primary" : "hover:bg-muted/50"
          )}
          title="Toggle HTML source"
        >
          {showHtml ? <><Eye className="h-3.5 w-3.5" /> Preview</> : <><Code2 className="h-3.5 w-3.5" /> HTML</>}
        </button>
      </div>

      {/* Selection style row */}
      {!showHtml && (
        <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 border-b border-border bg-muted/10 text-xs">
          <span className="text-muted-foreground">Selection:</span>
          <label className="inline-flex items-center gap-1">W
            <input value={selStyle.width} onChange={(e) => applyInlineStyle("width", e.target.value)}
              placeholder="auto" className="w-20 bg-background border border-border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary" />
          </label>
          <label className="inline-flex items-center gap-1">H
            <input value={selStyle.height} onChange={(e) => applyInlineStyle("height", e.target.value)}
              placeholder="auto" className="w-20 bg-background border border-border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary" />
          </label>
          <label className="inline-flex items-center gap-1">Line
            <input value={selStyle.lineHeight} onChange={(e) => applyInlineStyle("lineHeight", e.target.value)}
              placeholder="1.5" className="w-20 bg-background border border-border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary" />
          </label>
          <label className="inline-flex items-center gap-1">Spacing
            <input value={selStyle.letterSpacing} onChange={(e) => applyInlineStyle("letterSpacing", e.target.value)}
              placeholder="0px" className="w-20 bg-background border border-border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary" />
          </label>
          <span className="text-muted-foreground hidden md:inline">Highlight text → adjust values (e.g. 16px, 1.5em, 1.6)</span>
        </div>
      )}

      {/* Editor / HTML source */}
      <div className={cn(fullscreen && "flex-1 overflow-auto")}>
        {showHtml ? (
          <textarea
            value={htmlBuffer}
            onChange={(e) => { setHtmlBuffer(e.target.value); onChange(e.target.value); }}
            spellCheck={false}
            className="w-full min-h-[400px] p-4 bg-background/40 font-mono text-xs leading-relaxed text-foreground focus:outline-none resize-y"
            placeholder="<p>Write HTML here…</p>"
          />
        ) : (
          <EditorContent editor={editor} />
        )}
      </div>

      {/* Link modal */}
      <Modal open={linkModal} onClose={() => setLinkModal(false)} title="Insert link">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">URL</label>
            <input
              type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              autoFocus
              className="w-full glass rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Label (shown as the link text)</label>
            <input
              type="text" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)}
              placeholder="Click here"
              className="w-full glass rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <p className="text-xs text-muted-foreground">The label becomes the clickable link, and the URL is shown on the line below it.</p>
          <button type="button" disabled={!linkUrl} onClick={submitLink}
            className="w-full gradient-bg text-primary-foreground py-2 rounded-md text-sm font-medium disabled:opacity-40">
            Insert
          </button>
        </div>
      </Modal>

      {/* Image modal */}
      <Modal open={!!imgModal} onClose={() => { setImgModal(null); setLinkUrl(""); }} title="Insert image">
        {imgModal === "menu" && (
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setImgModal("upload")} className="glass rounded-xl p-4 hover:bg-muted/40 transition flex flex-col items-center gap-2 text-sm">
              <Upload className="h-5 w-5 text-primary" /> Upload
            </button>
            <button type="button" onClick={() => setImgModal("link")} className="glass rounded-xl p-4 hover:bg-muted/40 transition flex flex-col items-center gap-2 text-sm">
              <LinkIcon className="h-5 w-5 text-primary" /> Link
            </button>
          </div>
        )}
        {imgModal === "upload" && (
          <div className="space-y-3">
            <input ref={fileImgRef} type="file" accept="image/*" onChange={onImgFile} className="hidden" />
            <button type="button" disabled={uploading} onClick={() => fileImgRef.current?.click()}
              className="w-full glass rounded-xl p-6 hover:bg-muted/40 transition flex flex-col items-center gap-2 text-sm">
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5 text-primary" />}
              {uploading ? "Uploading…" : "Choose image from device"}
            </button>
            <p className="text-xs text-muted-foreground text-center">PNG, JPG, GIF, WebP — up to 10MB</p>
          </div>
        )}
        {imgModal === "link" && (
          <div className="space-y-3">
            <input
              type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="w-full glass rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              autoFocus
            />
            {linkUrl && (
              <div className="rounded-md overflow-hidden border border-border bg-black/20">
                <img src={linkUrl} alt="preview" className="w-full max-h-48 object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.3"; }} />
              </div>
            )}
            <button type="button" disabled={!linkUrl} onClick={() => insertImage(linkUrl)}
              className="w-full gradient-bg text-primary-foreground py-2 rounded-md text-sm font-medium disabled:opacity-40">
              Done
            </button>
          </div>
        )}
      </Modal>

      {/* Video modal */}
      <Modal open={!!vidModal} onClose={() => { setVidModal(null); setLinkUrl(""); }} title="Insert video">
        {vidModal === "menu" && (
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setVidModal("upload")} className="glass rounded-xl p-4 hover:bg-muted/40 transition flex flex-col items-center gap-2 text-sm">
              <Upload className="h-5 w-5 text-primary" /> Upload
            </button>
            <button type="button" onClick={() => setVidModal("link")} className="glass rounded-xl p-4 hover:bg-muted/40 transition flex flex-col items-center gap-2 text-sm">
              <LinkIcon className="h-5 w-5 text-primary" /> Link
            </button>
          </div>
        )}
        {vidModal === "upload" && (
          <div className="space-y-3">
            <input ref={fileVidRef} type="file" accept="video/*" onChange={onVidFile} className="hidden" />
            <button type="button" disabled={uploading} onClick={() => fileVidRef.current?.click()}
              className="w-full glass rounded-xl p-6 hover:bg-muted/40 transition flex flex-col items-center gap-2 text-sm">
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5 text-primary" />}
              {uploading ? "Uploading…" : "Choose video from device"}
            </button>
            <p className="text-xs text-muted-foreground text-center">MP4, WebM — up to 100MB</p>
          </div>
        )}
        {vidModal === "link" && (
          <div className="space-y-3">
            <input
              type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="YouTube, Vimeo, or direct .mp4 link"
              className="w-full glass rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              autoFocus
            />
            {linkUrl && (
              <div className="rounded-md overflow-hidden border border-border bg-black/40 aspect-video">
                {isYoutube(linkUrl) ? (
                  <iframe className="w-full h-full" src={linkUrl.replace("watch?v=", "embed/").replace("youtu.be/", "youtube.com/embed/")} allowFullScreen />
                ) : vimeoEmbed(linkUrl) ? (
                  <iframe className="w-full h-full" src={vimeoEmbed(linkUrl)!} allowFullScreen />
                ) : (
                  <video src={linkUrl} controls className="w-full h-full" />
                )}
              </div>
            )}
            <button type="button" disabled={!linkUrl} onClick={() => insertVideo(linkUrl, "link")}
              className="w-full gradient-bg text-primary-foreground py-2 rounded-md text-sm font-medium disabled:opacity-40">
              Done
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
