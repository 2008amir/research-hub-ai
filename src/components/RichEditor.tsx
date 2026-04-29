import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Youtube from "@tiptap/extension-youtube";
import { Extension, Node as TiptapNode, mergeAttributes } from "@tiptap/core";
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link as LinkIcon,
  Image as ImageIcon,
  Quote,
  Undo,
  Redo,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Code2,
  Eye,
  Video,
  Upload,
  Loader2,
  X,
  Highlighter,
  Type,
  Maximize2,
  Minimize2,
  PaintBucket,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  RotateCw,
  Trash2,
  Square,
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
        [
          "iframe",
          {
            src,
            frameborder: "0",
            allow: "autoplay; fullscreen; picture-in-picture",
            allowfullscreen: "true",
          },
        ],
      ];
    }
    return [
      "div",
      { "data-video-embed": "true", "data-provider": "file", class: "video-embed" },
      ["video", mergeAttributes({ src, controls: "true", playsinline: "true" })],
    ];
  },
});

const TextLayoutStyle = Extension.create({
  name: "textLayoutStyle",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          width: {
            default: null,
            parseHTML: (element) => element.style.width || null,
            renderHTML: (attributes) =>
              attributes.width
                ? { style: `width: ${attributes.width}; display: inline-block; max-width: 100%;` }
                : {},
          },
          height: {
            default: null,
            parseHTML: (element) => element.style.height || null,
            renderHTML: (attributes) =>
              attributes.height
                ? { style: `height: ${attributes.height}; display: inline-block;` }
                : {},
          },
          lineHeight: {
            default: null,
            parseHTML: (element) => element.style.lineHeight || null,
            renderHTML: (attributes) =>
              attributes.lineHeight ? { style: `line-height: ${attributes.lineHeight};` } : {},
          },
          letterSpacing: {
            default: null,
            parseHTML: (element) => element.style.letterSpacing || null,
            renderHTML: (attributes) =>
              attributes.letterSpacing
                ? { style: `letter-spacing: ${attributes.letterSpacing};` }
                : {},
          },
        },
      },
    ];
  },
});

/* ---------- Block style extension: lets paragraphs/headings/blockquote/listItem
   carry an arbitrary inline `style` attribute so we can paint a section
   background across every line in a multi-line selection. ---------- */
const BlockStyle = Extension.create({
  name: "blockStyle",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading", "blockquote", "listItem"],
        attributes: {
          style: {
            default: null,
            parseHTML: (el) => (el as HTMLElement).getAttribute("style") || null,
            renderHTML: (attrs) => (attrs.style ? { style: attrs.style } : {}),
          },
        },
      },
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

async function uploadWithRetry(
  bucket: string,
  path: string,
  file: File,
  contentType: string,
  attempts = 3,
) {
  let lastErr: any = null;
  for (let i = 0; i < attempts; i++) {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { cacheControl: "3600", contentType });
    if (!error) return null;
    lastErr = error;
    const msg = (error.message || "").toLowerCase();
    const transient =
      msg.includes("08p01") ||
      msg.includes("database") ||
      msg.includes("recovery") ||
      msg.includes("connection") ||
      msg.includes("503");
    if (!transient) break;
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  return lastErr;
}

/* ---------- Modal ---------- */
function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="glass-strong rounded-2xl p-5 w-full max-w-md border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted/50" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- Fonts ---------- */
const FONTS: { label: string; family: string }[] = [
  // Sans / classic
  { label: "Inter", family: "Inter, ui-sans-serif, system-ui, sans-serif" },
  { label: "Arial", family: "Arial, Helvetica, sans-serif" },
  { label: "Arial Black", family: "'Arial Black', Gadget, sans-serif" },
  { label: "Helvetica", family: "Helvetica, Arial, sans-serif" },
  { label: "Verdana", family: "Verdana, Geneva, sans-serif" },
  { label: "Tahoma", family: "Tahoma, Geneva, sans-serif" },
  { label: "Trebuchet MS", family: "'Trebuchet MS', Helvetica, sans-serif" },
  { label: "Georgia", family: "Georgia, serif" },
  { label: "Times New Roman", family: "'Times New Roman', Times, serif" },
  { label: "Garamond", family: "Garamond, 'Times New Roman', serif" },
  { label: "Palatino", family: "'Palatino Linotype', Palatino, serif" },
  { label: "Courier New", family: "'Courier New', Courier, monospace" },
  { label: "Lucida Console", family: "'Lucida Console', Monaco, monospace" },
  { label: "Monaco", family: "Monaco, Consolas, monospace" },
  { label: "Impact", family: "Impact, Charcoal, sans-serif" },
  { label: "Comic Sans", family: "'Comic Sans MS', cursive" },
  { label: "Brush Script", family: "'Brush Script MT', cursive" },
  { label: "Copperplate", family: "Copperplate, Papyrus, fantasy" },
  { label: "Optima", family: "Optima, Candara, sans-serif" },
  { label: "Gill Sans", family: "'Gill Sans', 'Gill Sans MT', Calibri, sans-serif" },
  // 10 additional standard
  { label: "Roboto", family: "Roboto, system-ui, sans-serif" },
  { label: "Open Sans", family: "'Open Sans', system-ui, sans-serif" },
  { label: "Lato", family: "Lato, system-ui, sans-serif" },
  { label: "Montserrat", family: "Montserrat, system-ui, sans-serif" },
  { label: "Poppins", family: "Poppins, system-ui, sans-serif" },
  { label: "Source Sans Pro", family: "'Source Sans Pro', system-ui, sans-serif" },
  { label: "Nunito", family: "Nunito, system-ui, sans-serif" },
  { label: "Raleway", family: "Raleway, system-ui, sans-serif" },
  { label: "Merriweather", family: "Merriweather, Georgia, serif" },
  { label: "Playfair Display", family: "'Playfair Display', Georgia, serif" },
  // 10 decorative / display
  { label: "Pacifico", family: "Pacifico, 'Brush Script MT', cursive" },
  { label: "Lobster", family: "Lobster, 'Brush Script MT', cursive" },
  { label: "Dancing Script", family: "'Dancing Script', 'Brush Script MT', cursive" },
  { label: "Great Vibes", family: "'Great Vibes', cursive" },
  { label: "Satisfy", family: "Satisfy, cursive" },
  { label: "Caveat", family: "Caveat, 'Comic Sans MS', cursive" },
  { label: "Shadows Into Light", family: "'Shadows Into Light', cursive" },
  { label: "Permanent Marker", family: "'Permanent Marker', Impact, sans-serif" },
  { label: "Bangers", family: "Bangers, Impact, sans-serif" },
  { label: "Press Start 2P", family: "'Press Start 2P', monospace" },
];

const DECORATIVE_FONT_LABELS = new Set([
  "Pacifico","Lobster","Dancing Script","Great Vibes","Satisfy","Caveat",
  "Shadows Into Light","Permanent Marker","Bangers","Press Start 2P",
  "Roboto","Open Sans","Lato","Montserrat","Poppins","Source Sans Pro",
  "Nunito","Raleway","Merriweather","Playfair Display",
]);

const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?" +
  [
    "Roboto:wght@400;700","Open+Sans:wght@400;700","Lato:wght@400;700",
    "Montserrat:wght@400;700","Poppins:wght@400;700","Source+Sans+Pro:wght@400;700",
    "Nunito:wght@400;700","Raleway:wght@400;700","Merriweather:wght@400;700",
    "Playfair+Display:wght@400;700","Pacifico","Lobster","Dancing+Script:wght@400;700",
    "Great+Vibes","Satisfy","Caveat:wght@400;700","Shadows+Into+Light",
    "Permanent+Marker","Bangers","Press+Start+2P",
  ].map((f) => `family=${f}`).join("&") + "&display=swap";

/* ---------- Color picker with transparent swatch ---------- */
const PRESET_COLORS = [
  "#000000","#ffffff","#ef4444","#f97316","#eab308","#22c55e",
  "#06b6d4","#3b82f6","#8b5cf6","#ec4899","#64748b","#7c2d12",
];
function ColorPicker({
  icon,
  title,
  onPick,
}: {
  icon: React.ReactNode;
  title: string;
  onPick: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-flex">
      <button
        type="button"
        title={title}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 px-1.5 py-1 rounded-md hover:bg-muted/50 border border-transparent"
      >
        {icon}
        <span className="text-[10px] text-muted-foreground">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[2147483600]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-[2147483601] w-44 rounded-md border border-border bg-popover p-2 shadow-xl">
            <div className="grid grid-cols-6 gap-1.5">
              <button
                type="button"
                title="Transparent"
                onClick={() => { onPick("transparent"); setOpen(false); }}
                className="h-6 w-6 rounded border border-border bg-white relative overflow-hidden"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%)",
                  backgroundSize: "8px 8px",
                  backgroundPosition: "0 0,0 4px,4px -4px,-4px 0",
                }}
              />
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { onPick(c); setOpen(false); }}
                  className="h-6 w-6 rounded border border-border"
                  style={{ background: c }}
                  title={c}
                />
              ))}
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              Custom
              <input
                type="color"
                onChange={(e) => { onPick(e.target.value); setOpen(false); }}
                className="h-6 w-10 rounded cursor-pointer bg-transparent border border-border"
              />
            </label>
          </div>
        </>
      )}
    </div>
  );
}

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
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const [fontSearch, setFontSearch] = useState("");
  const [pageBg, setPageBg] = useState<string>("#ffffff");
  const [selectedFont, setSelectedFont] = useState(FONTS[0]);

  // Selection style inputs (committed-on-Enter)
  const [selStyle, setSelStyle] = useState({
    width: "",
    height: "",
    lineHeight: "",
    letterSpacing: "",
  });
  // Stored ProseMirror selection captured BEFORE the user clicks into a style input
  const savedRangeRef = useRef<{ from: number; to: number } | null>(null);

  // Debounce parent onChange so each keystroke (esp. delete/backspace) doesn't
  // trigger a re-render of the lazily-loaded editor — keeps typing & deleting smooth.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const debounceRef = useRef<number | null>(null);
  const scheduleParentChange = useCallback((html: string) => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      onChangeRef.current(html);
    }, 220);
  }, []);
  useEffect(
    () => () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    },
    [],
  );

  // Floating toolbar for selected image / video
  const [mediaSel, setMediaSel] = useState<null | {
    el: HTMLElement;
    width: string;
    height: string;
    radius: string;
    rotate: string;
  }>(null);

  const fileImgRef = useRef<HTMLInputElement>(null);
  const fileVidRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit, // includes heading 1-6, lists, link, underline, blockquote, code, history…
      TextStyle,
      TextLayoutStyle,
      BlockStyle,
      Color,
      FontFamily.configure({ types: ["textStyle"] }),
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({
        types: ["heading", "paragraph", "image"],
        alignments: ["left", "center", "right", "justify"],
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: { class: "rich-image" },
      }),
      Youtube.configure({
        controls: true,
        nocookie: true,
        HTMLAttributes: { class: "video-embed-youtube" },
      }),
      VideoEmbed,
    ] as any,
    content: value,
    editorProps: {
      attributes: {
        class:
          "prose max-w-none min-h-[300px] focus:outline-none p-4 rich-editor-content rich-editor-light",
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      setHtmlBuffer(html);
      scheduleParentChange(html);
    },
    onSelectionUpdate: () => readSelectionStyle(),
    immediatelyRender: false,
  });

  useEffect(() => {
    // Only sync external value into the editor when it really differs from what
    // we're locally editing — prevents the debounced parent state from
    // overwriting the editor mid-keystroke and causing slow/janky deletes.
    if (editor && value !== editor.getHTML() && value !== htmlBuffer && !showHtml) {
      editor.commands.setContent(value || "", { emitUpdate: false });
      setHtmlBuffer(value || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  // Lock body scroll while fullscreen so the standalone editor truly stands alone
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (fullscreen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [fullscreen]);

  // Inject Google Fonts stylesheet once so decorative fonts render in the picker + editor
  useEffect(() => {
    if (typeof document === "undefined") return;
    const id = "rich-editor-google-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = GOOGLE_FONTS_HREF;
    document.head.appendChild(link);
  }, []);

  const readSelectionStyle = useCallback(() => {
    if (typeof window === "undefined") return;
    const attrs = editor?.getAttributes("textStyle") || {};
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      setSelStyle({
        width: attrs.width || "",
        height: attrs.height || "",
        lineHeight: attrs.lineHeight || "",
        letterSpacing: attrs.letterSpacing || "",
      });
      return;
    }
    let node: Node | null = sel.anchorNode;
    while (node && node.nodeType !== 1) node = node.parentNode;
    if (!node) return;
    const cs = window.getComputedStyle(node as Element);
    setSelStyle({
      width: attrs.width || (node as HTMLElement).style?.width || "",
      height: attrs.height || (node as HTMLElement).style?.height || "",
      lineHeight:
        attrs.lineHeight || (node as HTMLElement).style?.lineHeight || cs.lineHeight || "",
      letterSpacing:
        attrs.letterSpacing || (node as HTMLElement).style?.letterSpacing || cs.letterSpacing || "",
    });
  }, [editor]);

  if (!editor) return <div className="glass rounded-xl h-80 animate-pulse" />;

  const uploadToBucket = async (file: File, kind: "image" | "video") => {
    if (!user) {
      toast.error("Sign in required");
      return null;
    }
    const max = kind === "image" ? 10 : 100;
    if (file.size > max * 1024 * 1024) {
      toast.error(`Max ${max}MB`);
      return null;
    }
    const ext = file.name.split(".").pop() || (kind === "image" ? "png" : "mp4");
    const path = `${user.id}/${kind}/${Date.now()}.${ext}`;
    const err = await uploadWithRetry("research-media", path, file, file.type);
    if (err) {
      toast.error(err.message || "Upload failed");
      return null;
    }
    const { data } = supabase.storage.from("research-media").getPublicUrl(path);
    return data.publicUrl;
  };

  const insertImage = (url: string) => {
    editor.chain().focus().setImage({ src: url }).run();
    setImgModal(null);
    setLinkUrl("");
  };

  const insertVideo = (url: string, source: "file" | "link") => {
    if (source === "link") {
      if (isYoutube(url)) {
        (editor.chain().focus() as any)
          .setYoutubeVideo({ src: url, width: 640, height: 360 })
          .run();
      } else {
        const vimeo = vimeoEmbed(url);
        if (vimeo)
          editor
            .chain()
            .focus()
            .insertContent({ type: "videoEmbed", attrs: { src: vimeo, provider: "vimeo" } })
            .run();
        else
          editor
            .chain()
            .focus()
            .insertContent({ type: "videoEmbed", attrs: { src: url, provider: "file" } })
            .run();
      }
    } else {
      editor
        .chain()
        .focus()
        .insertContent({ type: "videoEmbed", attrs: { src: url, provider: "file" } })
        .run();
    }
    setVidModal(null);
    setLinkUrl("");
  };

  const onImgFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    const url = await uploadToBucket(f, "image");
    setUploading(false);
    if (url) insertImage(url);
    e.target.value = "";
  };
  const onVidFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
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
      chain
        .insertContent(
          `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer">${label}</a><br><span class="link-url-below">${linkUrl}</span>`,
        )
        .run();
    } else {
      chain
        .deleteSelection()
        .insertContent(
          `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer">${label}</a><br><span class="link-url-below">${linkUrl}</span>`,
        )
        .run();
    }
    setLinkModal(false);
    setLinkUrl("");
    setLinkLabel("");
  };

  const normalizeStyleValue = (
    prop: "lineHeight" | "letterSpacing" | "width" | "height",
    raw: string,
  ) => {
    const value = raw.trim();
    if (!value) return "";
    if (
      (prop === "width" || prop === "height" || prop === "letterSpacing") &&
      /^-?\d+(\.\d+)?$/.test(value)
    )
      return `${value}px`;
    return value;
  };

  const chooseFont = (font: (typeof FONTS)[number]) => {
    setSelectedFont(font);
    setFontMenuOpen(false);
    editor.chain().focus().setFontFamily(font.family).run();
  };

  // Capture current editor selection so it survives focusing the W/H/Line/Spacing inputs.
  const captureSelection = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    savedRangeRef.current = { from, to };
  };

  // Commit a style value to the saved editor selection. Called only on Enter or blur.
  const commitInlineStyle = (
    prop: "lineHeight" | "letterSpacing" | "width" | "height",
    val: string,
  ) => {
    const normalized = normalizeStyleValue(prop, val);
    const range = savedRangeRef.current;
    const chain = editor.chain();
    if (range && range.from !== range.to) {
      chain.setTextSelection(range);
    } else {
      chain.focus();
    }
    const attrs = { [prop]: normalized || null } as Record<string, string | null>;
    chain.setMark("textStyle", attrs).removeEmptyTextStyle().run();
    const html = editor.getHTML();
    setHtmlBuffer(html);
    scheduleParentChange(html);
  };

  // Apply a background color across every block (paragraph/heading/li) touched
  // by the current selection — so highlighting from line 1 to line N tints
  // every line, not just the inline run.
  const applySectionBackground = (color: string) => {
    if (!editor) return;
    const { state } = editor;
    const { from, to } = state.selection;
    const tr = state.tr;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (
        node.type.name === "paragraph" ||
        node.type.name === "heading" ||
        node.type.name === "blockquote" ||
        node.type.name === "listItem"
      ) {
        const existing = (node.attrs as any)?.style || "";
        const cleaned = existing.replace(/background-color\s*:\s*[^;]+;?/gi, "").trim();
        const nextStyle = `${cleaned}${cleaned && !cleaned.endsWith(";") ? ";" : ""}background-color:${color};`;
        try {
          tr.setNodeAttribute(pos, "style" as any, nextStyle);
        } catch {
          // node type might not allow a style attr — fall back to inline highlight
        }
        return false;
      }
      return true;
    });
    if (tr.docChanged) {
      editor.view.dispatch(tr);
      const html = editor.getHTML();
      setHtmlBuffer(html);
      scheduleParentChange(html);
    } else {
      // Fallback: inline highlight covers the run
      (editor.chain().focus() as any).setHighlight({ color }).run();
    }
  };

  // Open the floating media toolbar (replacing the formatting toolbar)
  // when an image / video / iframe is hovered or clicked.
  const openMediaToolbar = (media: HTMLElement) => {
    const inline = media.style;
    const cs = window.getComputedStyle(media);
    setMediaSel({
      el: media,
      width: inline.width || `${Math.round(media.getBoundingClientRect().width)}px`,
      height: inline.height || `${Math.round(media.getBoundingClientRect().height)}px`,
      radius: inline.borderRadius || cs.borderRadius || "0px",
      rotate: (inline.transform.match(/rotate\(([-\d.]+)deg\)/) || [, "0"])[1] + "deg",
    });
  };

  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const media = target.closest(
      "img, video, iframe, .video-embed, [data-youtube-video]",
    ) as HTMLElement | null;
    if (media) openMediaToolbar(media);
  };

  const handleEditorMouseOver = (e: React.MouseEvent<HTMLDivElement>) => {
    if (mediaSel) return;
    const target = e.target as HTMLElement;
    const media = target.closest(
      "img, video, iframe, .video-embed, [data-youtube-video]",
    ) as HTMLElement | null;
    if (media) openMediaToolbar(media);
  };

  const deleteSelectedMedia = () => {
    if (!mediaSel || !editor) return;
    const el = mediaSel.el;
    // Use TipTap to find the node at the DOM position and delete it
    const pos = (editor.view as any).posAtDOM(el, 0);
    if (typeof pos === "number" && pos >= 0) {
      const $pos = editor.state.doc.resolve(pos);
      // walk up to find an ancestor node we can delete
      const tr = editor.state.tr;
      const node = editor.state.doc.nodeAt(pos);
      if (node) {
        tr.delete(pos, pos + node.nodeSize);
        editor.view.dispatch(tr);
      } else {
        el.remove();
        const html = editor.getHTML();
        setHtmlBuffer(html);
        scheduleParentChange(html);
      }
    } else {
      el.remove();
    }
    setMediaSel(null);
  };

  const updateMediaStyle = (
    patch: Partial<{ width: string; height: string; radius: string; rotate: string }>,
  ) => {
    setMediaSel((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      const el = next.el;
      if (patch.width !== undefined) el.style.width = patch.width;
      if (patch.height !== undefined) el.style.height = patch.height;
      if (patch.radius !== undefined) el.style.borderRadius = patch.radius;
      if (patch.rotate !== undefined) {
        const others = el.style.transform.replace(/rotate\([^)]+\)/g, "").trim();
        const deg = patch.rotate.endsWith("deg") ? patch.rotate : `${patch.rotate}deg`;
        el.style.transform = `${others} rotate(${deg})`.trim();
      }
      // Persist HTML
      if (editor) {
        const html = editor.getHTML();
        setHtmlBuffer(html);
        scheduleParentChange(html);
      }
      return next;
    });
  };

  const nudgeMedia = (dir: "left" | "right" | "up" | "down") => {
    if (!mediaSel) return;
    const el = mediaSel.el;
    const cs = window.getComputedStyle(el);
    const ml = parseFloat(cs.marginLeft) || 0;
    const mt = parseFloat(cs.marginTop) || 0;
    const step = 8;
    if (dir === "left") el.style.marginLeft = `${ml - step}px`;
    if (dir === "right") el.style.marginLeft = `${ml + step}px`;
    if (dir === "up") el.style.marginTop = `${mt - step}px`;
    if (dir === "down") el.style.marginTop = `${mt + step}px`;
    if (editor) {
      const html = editor.getHTML();
      setHtmlBuffer(html);
      scheduleParentChange(html);
    }
  };

  const Btn = ({
    on,
    active,
    children,
    label,
    disabled,
  }: {
    on: () => void;
    active?: boolean;
    children: React.ReactNode;
    label: string;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        "p-2 rounded-md hover:bg-muted/50 transition disabled:opacity-40",
        active && "bg-primary/20 text-primary",
      )}
    >
      {children}
    </button>
  );

  const editorTree = (
    <div
      className={cn(
        "glass rounded-xl overflow-hidden border border-border",
        fullscreen &&
          "fixed inset-0 z-[2147483600] rounded-none flex flex-col bg-background border-0",
      )}
    >
      {/* Top action bar with fullscreen */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/10">
        <span className="text-xs text-muted-foreground font-medium">Content editor</span>
        <button
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-muted/50 transition"
        >
          {fullscreen ? (
            <>
              <Minimize2 className="h-3.5 w-3.5" /> Minimize
            </>
          ) : (
            <>
              <Maximize2 className="h-3.5 w-3.5" /> Full page
            </>
          )}
        </button>
      </div>

      {/* Toolbar */}
      <div className="relative flex flex-wrap items-center gap-1 p-2 border-b border-border bg-muted/20">
        <div
          className={cn(
            "flex flex-wrap items-center gap-1 w-full",
            mediaSel && !showHtml && "invisible pointer-events-none",
          )}
        >
        {!showHtml && (
          <></>
        )}
        {!showHtml && (
          <>{/* spacer kept for diff stability */}</>
        )}
        {!showHtml && (
          <>
            <Btn
              label="Bold"
              on={() => editor.chain().focus().toggleBold().run()}
              active={editor.isActive("bold")}
            >
              <Bold className="h-4 w-4" />
            </Btn>
            <Btn
              label="Italic"
              on={() => editor.chain().focus().toggleItalic().run()}
              active={editor.isActive("italic")}
            >
              <Italic className="h-4 w-4" />
            </Btn>
            <Btn
              label="Underline"
              on={() => (editor.chain().focus() as any).toggleUnderline().run()}
              active={editor.isActive("underline")}
            >
              <UnderlineIcon className="h-4 w-4" />
            </Btn>
            <div className="w-px h-5 bg-border mx-1" />
            <Btn
              label="Heading 1"
              on={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              active={editor.isActive("heading", { level: 1 })}
            >
              <Heading1 className="h-4 w-4" />
            </Btn>
            <Btn
              label="Heading 2"
              on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              active={editor.isActive("heading", { level: 2 })}
            >
              <Heading2 className="h-4 w-4" />
            </Btn>
            <Btn
              label="Heading 3"
              on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              active={editor.isActive("heading", { level: 3 })}
            >
              <Heading3 className="h-4 w-4" />
            </Btn>
            <Btn
              label="Bullet list"
              on={() => editor.chain().focus().toggleBulletList().run()}
              active={editor.isActive("bulletList")}
            >
              <List className="h-4 w-4" />
            </Btn>
            <Btn
              label="Numbered list"
              on={() => editor.chain().focus().toggleOrderedList().run()}
              active={editor.isActive("orderedList")}
            >
              <ListOrdered className="h-4 w-4" />
            </Btn>
            <Btn
              label="Quote"
              on={() => editor.chain().focus().toggleBlockquote().run()}
              active={editor.isActive("blockquote")}
            >
              <Quote className="h-4 w-4" />
            </Btn>

            <div className="w-px h-5 bg-border mx-1" />
            <Btn
              label="Align left"
              on={() => (editor.chain().focus() as any).setTextAlign("left").run()}
              active={editor.isActive({ textAlign: "left" })}
            >
              <AlignLeft className="h-4 w-4" />
            </Btn>
            <Btn
              label="Align center"
              on={() => (editor.chain().focus() as any).setTextAlign("center").run()}
              active={editor.isActive({ textAlign: "center" })}
            >
              <AlignCenter className="h-4 w-4" />
            </Btn>
            <Btn
              label="Align right"
              on={() => (editor.chain().focus() as any).setTextAlign("right").run()}
              active={editor.isActive({ textAlign: "right" })}
            >
              <AlignRight className="h-4 w-4" />
            </Btn>
            <Btn
              label="Justify"
              on={() => (editor.chain().focus() as any).setTextAlign("justify").run()}
              active={editor.isActive({ textAlign: "justify" })}
            >
              <AlignJustify className="h-4 w-4" />
            </Btn>

            <div className="w-px h-5 bg-border mx-1" />
            {/* Font family — custom 40% width menu so every option shows its own style */}
            <div className="relative inline-flex w-[40%] min-w-0 max-w-[40%] basis-[40%] items-center gap-1">
              <Type className="h-4 w-4 text-muted-foreground shrink-0" />
              <button
                type="button"
                aria-label="Font"
                onClick={() => setFontMenuOpen((open) => !open)}
                className="flex h-9 w-full items-center justify-between rounded-md border border-border bg-background px-3 text-left text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <span className="truncate" style={{ fontFamily: selectedFont.family }}>
                  {selectedFont.label}
                </span>
                <span className="text-muted-foreground">⌄</span>
              </button>
              {fontMenuOpen && (
                <div className="absolute left-5 right-0 top-10 z-[2147483601] flex max-h-80 flex-col rounded-md border border-border bg-popover text-popover-foreground shadow-xl">
                  <div className="sticky top-0 z-10 border-b border-border bg-popover p-1.5">
                    <input
                      type="text"
                      autoFocus
                      value={fontSearch}
                      onChange={(e) => setFontSearch(e.target.value)}
                      placeholder="Search fonts…"
                      className="w-full rounded-sm border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div className="overflow-y-auto p-1">
                    {FONTS.filter((f) =>
                      f.label.toLowerCase().includes(fontSearch.trim().toLowerCase()),
                    ).map((font) => (
                      <button
                        key={font.label}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          chooseFont(font);
                          setFontSearch("");
                        }}
                        className={cn(
                          "flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                          selectedFont.label === font.label && "bg-primary/20 text-primary",
                          DECORATIVE_FONT_LABELS.has(font.label) && "text-base",
                        )}
                        style={{ fontFamily: font.family }}
                      >
                        <span>{font.label}</span>
                        <span className="text-[10px] opacity-70">Aa Bb</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Text color */}
            <ColorPicker
              icon={<span className="text-foreground font-semibold text-sm">A</span>}
              title="Text color"
              onPick={(c) => {
                if (c === "transparent") (editor.chain().focus() as any).unsetColor().run();
                else editor.chain().focus().setColor(c).run();
              }}
            />

            {/* Highlight color */}
            <ColorPicker
              icon={<Highlighter className="h-4 w-4 text-muted-foreground" />}
              title="Highlight"
              onPick={(c) => {
                if (c === "transparent") (editor.chain().focus() as any).unsetHighlight().run();
                else (editor.chain().focus() as any).setHighlight({ color: c }).run();
              }}
            />

            {/* Section background color — colors every line in the highlighted range */}
            <ColorPicker
              icon={<PaintBucket className="h-4 w-4 text-muted-foreground" />}
              title="Section background (colors every highlighted line from start to end)"
              onPick={(c) => applySectionBackground(c)}
            />

            {/* Page background — recolors the whole editor surface */}
            <ColorPicker
              icon={<Square className="h-4 w-4 text-muted-foreground" fill="currentColor" />}
              title="Page background"
              onPick={(c) => setPageBg(c)}
            />

            <div className="w-px h-5 bg-border mx-1" />
            <Btn label="Insert link" on={openLinkModal}>
              <LinkIcon className="h-4 w-4" />
            </Btn>
            <Btn label="Insert image" on={() => setImgModal("menu")}>
              <ImageIcon className="h-4 w-4" />
            </Btn>
            <Btn label="Insert video" on={() => setVidModal("menu")}>
              <Video className="h-4 w-4" />
            </Btn>

            <div className="w-px h-5 bg-border mx-1" />
            <Btn label="Undo" on={() => editor.chain().focus().undo().run()}>
              <Undo className="h-4 w-4" />
            </Btn>
            <Btn label="Redo" on={() => editor.chain().focus().redo().run()}>
              <Redo className="h-4 w-4" />
            </Btn>
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
            showHtml ? "bg-primary/20 text-primary" : "hover:bg-muted/50",
          )}
          title="Toggle HTML source"
        >
          {showHtml ? (
            <>
              <Eye className="h-3.5 w-3.5" /> Preview
            </>
          ) : (
            <>
              <Code2 className="h-3.5 w-3.5" /> HTML
            </>
          )}
        </button>
      </div>

      {/* Selection style row — commit on Enter (or blur) so the editor selection is preserved */}
      {!showHtml && (
        <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 border-b border-border bg-muted/10 text-xs">
          <span className="text-muted-foreground">Selection:</span>
          {(
            [
              { key: "width", label: "W", placeholder: "auto" },
              { key: "height", label: "H", placeholder: "auto" },
              { key: "lineHeight", label: "Line", placeholder: "1.5" },
              { key: "letterSpacing", label: "Spacing", placeholder: "0px" },
            ] as const
          ).map((field) => (
            <label key={field.key} className="inline-flex items-center gap-1">
              {field.label}
              <input
                value={selStyle[field.key]}
                onFocus={captureSelection}
                onChange={(e) =>
                  setSelStyle((s) => ({ ...s, [field.key]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitInlineStyle(field.key, (e.target as HTMLInputElement).value);
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                onBlur={(e) => commitInlineStyle(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="w-20 bg-background border border-border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
          ))}
          <span className="text-muted-foreground hidden md:inline">
            Highlight text → type a value → press Enter to apply
          </span>
        </div>
      )}

      {/* Editor / HTML source */}
      <div
        className={cn(
          "rich-editor-stage relative",
          fullscreen && "rich-editor-stage-fullscreen flex min-h-0 flex-1 flex-col overflow-auto",
        )}
        onClick={!showHtml ? handleEditorClick : undefined}
      >
        {showHtml ? (
          <textarea
            value={htmlBuffer}
            onChange={(e) => {
              setHtmlBuffer(e.target.value);
              onChange(e.target.value);
            }}
            spellCheck={false}
            className={cn(
              "rich-html-source w-full min-h-[400px] p-4 font-mono text-xs leading-relaxed focus:outline-none resize-y",
              fullscreen && "min-h-full flex-1 resize-none",
            )}
            placeholder="<p>Write HTML here…</p>"
          />
        ) : (
          <EditorContent
            editor={editor}
            className={cn(fullscreen && "rich-editor-shell-fullscreen")}
          />
        )}

        {/* Floating media toolbar — appears when an image / video is clicked */}
        {!showHtml && mediaSel && (
          <div
            className="sticky top-2 z-30 mx-2 mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-popover/95 backdrop-blur p-2 text-xs text-popover-foreground shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="font-medium text-muted-foreground">Media:</span>
            {(
              [
                { key: "width", label: "W" },
                { key: "height", label: "H" },
                { key: "radius", label: "Radius" },
              ] as const
            ).map((f) => (
              <label key={f.key} className="inline-flex items-center gap-1">
                {f.label}
                <input
                  value={mediaSel[f.key]}
                  onChange={(e) => {
                    const v = e.target.value;
                    const patch: any = {};
                    patch[f.key] = /^\d+(\.\d+)?$/.test(v.trim()) ? `${v.trim()}px` : v;
                    updateMediaStyle(patch);
                  }}
                  className="w-20 rounded border border-border bg-background px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
            ))}
            <div className="w-px h-5 bg-border mx-1" />
            <button type="button" title="Move left" onClick={() => nudgeMedia("left")} className="p-1 rounded hover:bg-muted/50">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button type="button" title="Move up" onClick={() => nudgeMedia("up")} className="p-1 rounded hover:bg-muted/50">
              <ArrowUp className="h-4 w-4" />
            </button>
            <button type="button" title="Move down" onClick={() => nudgeMedia("down")} className="p-1 rounded hover:bg-muted/50">
              <ArrowDown className="h-4 w-4" />
            </button>
            <button type="button" title="Move right" onClick={() => nudgeMedia("right")} className="p-1 rounded hover:bg-muted/50">
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Rotate 15°"
              onClick={() => {
                const cur = parseFloat(mediaSel.rotate) || 0;
                updateMediaStyle({ rotate: `${cur + 15}deg` });
              }}
              className="p-1 rounded hover:bg-muted/50"
            >
              <RotateCw className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setMediaSel(null)} className="ml-auto p-1 rounded hover:bg-muted/50" title="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Link modal */}
      <Modal open={linkModal} onClose={() => setLinkModal(false)} title="Insert link">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">URL</label>
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              autoFocus
              className="w-full glass rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Label (shown as the link text)</label>
            <input
              type="text"
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              placeholder="Click here"
              className="w-full glass rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            The label becomes the clickable link, and the URL is shown on the line below it.
          </p>
          <button
            type="button"
            disabled={!linkUrl}
            onClick={submitLink}
            className="w-full gradient-bg text-primary-foreground py-2 rounded-md text-sm font-medium disabled:opacity-40"
          >
            Insert
          </button>
        </div>
      </Modal>

      {/* Image modal */}
      <Modal
        open={!!imgModal}
        onClose={() => {
          setImgModal(null);
          setLinkUrl("");
        }}
        title="Insert image"
      >
        {imgModal === "menu" && (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setImgModal("upload")}
              className="glass rounded-xl p-4 hover:bg-muted/40 transition flex flex-col items-center gap-2 text-sm"
            >
              <Upload className="h-5 w-5 text-primary" /> Upload
            </button>
            <button
              type="button"
              onClick={() => setImgModal("link")}
              className="glass rounded-xl p-4 hover:bg-muted/40 transition flex flex-col items-center gap-2 text-sm"
            >
              <LinkIcon className="h-5 w-5 text-primary" /> Link
            </button>
          </div>
        )}
        {imgModal === "upload" && (
          <div className="space-y-3">
            <input
              ref={fileImgRef}
              type="file"
              accept="image/*"
              onChange={onImgFile}
              className="hidden"
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileImgRef.current?.click()}
              className="w-full glass rounded-xl p-6 hover:bg-muted/40 transition flex flex-col items-center gap-2 text-sm"
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Upload className="h-5 w-5 text-primary" />
              )}
              {uploading ? "Uploading…" : "Choose image from device"}
            </button>
            <p className="text-xs text-muted-foreground text-center">
              PNG, JPG, GIF, WebP — up to 10MB
            </p>
          </div>
        )}
        {imgModal === "link" && (
          <div className="space-y-3">
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="w-full glass rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              autoFocus
            />
            {linkUrl && (
              <div className="rounded-md overflow-hidden border border-border bg-black/20">
                <img
                  src={linkUrl}
                  alt="preview"
                  className="w-full max-h-48 object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
                  }}
                />
              </div>
            )}
            <button
              type="button"
              disabled={!linkUrl}
              onClick={() => insertImage(linkUrl)}
              className="w-full gradient-bg text-primary-foreground py-2 rounded-md text-sm font-medium disabled:opacity-40"
            >
              Done
            </button>
          </div>
        )}
      </Modal>

      {/* Video modal */}
      <Modal
        open={!!vidModal}
        onClose={() => {
          setVidModal(null);
          setLinkUrl("");
        }}
        title="Insert video"
      >
        {vidModal === "menu" && (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setVidModal("upload")}
              className="glass rounded-xl p-4 hover:bg-muted/40 transition flex flex-col items-center gap-2 text-sm"
            >
              <Upload className="h-5 w-5 text-primary" /> Upload
            </button>
            <button
              type="button"
              onClick={() => setVidModal("link")}
              className="glass rounded-xl p-4 hover:bg-muted/40 transition flex flex-col items-center gap-2 text-sm"
            >
              <LinkIcon className="h-5 w-5 text-primary" /> Link
            </button>
          </div>
        )}
        {vidModal === "upload" && (
          <div className="space-y-3">
            <input
              ref={fileVidRef}
              type="file"
              accept="video/*"
              onChange={onVidFile}
              className="hidden"
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileVidRef.current?.click()}
              className="w-full glass rounded-xl p-6 hover:bg-muted/40 transition flex flex-col items-center gap-2 text-sm"
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Upload className="h-5 w-5 text-primary" />
              )}
              {uploading ? "Uploading…" : "Choose video from device"}
            </button>
            <p className="text-xs text-muted-foreground text-center">MP4, WebM — up to 100MB</p>
          </div>
        )}
        {vidModal === "link" && (
          <div className="space-y-3">
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="YouTube, Vimeo, or direct .mp4 link"
              className="w-full glass rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              autoFocus
            />
            {linkUrl && (
              <div className="rounded-md overflow-hidden border border-border bg-black/40 aspect-video">
                {isYoutube(linkUrl) ? (
                  <iframe
                    className="w-full h-full"
                    src={linkUrl
                      .replace("watch?v=", "embed/")
                      .replace("youtu.be/", "youtube.com/embed/")}
                    allowFullScreen
                  />
                ) : vimeoEmbed(linkUrl) ? (
                  <iframe className="w-full h-full" src={vimeoEmbed(linkUrl)!} allowFullScreen />
                ) : (
                  <video src={linkUrl} controls className="w-full h-full" />
                )}
              </div>
            )}
            <button
              type="button"
              disabled={!linkUrl}
              onClick={() => insertVideo(linkUrl, "link")}
              className="w-full gradient-bg text-primary-foreground py-2 rounded-md text-sm font-medium disabled:opacity-40"
            >
              Done
            </button>
          </div>
        )}
      </Modal>
    </div>
  );

  if (fullscreen && typeof document !== "undefined") {
    return createPortal(editorTree, document.body);
  }
  return editorTree;
}
