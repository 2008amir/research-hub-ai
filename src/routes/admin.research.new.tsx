import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichEditor } from "@/components/RichEditor";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";

export const Route = createFileRoute("/admin/research/new")({ component: AddResearch });

function AddResearch() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: "", description: "", header_image_url: "", category: "drugs", section: "", content_html: "",
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const onUploadHeader = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("research-images").upload(path, file);
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data } = supabase.storage.from("research-images").getPublicUrl(path);
    setForm((f) => ({ ...f, header_image_url: data.publicUrl }));
    setUploading(false);
    toast.success("Image uploaded");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.title.trim()) { toast.error("Title required"); return; }
    setSaving(true);
    const { error } = await supabase.from("research").insert({
      title: form.title,
      description: form.description,
      header_image_url: form.header_image_url || null,
      category: form.category as any,
      section: form.section,
      content_html: form.content_html,
      author_id: user.id,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Research published!");
    navigate({ to: "/admin/research" });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-8 max-w-3xl">
      <h1 className="text-2xl font-bold gradient-text">Add Research</h1>

      <section className="glass-strong rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold">Section 1 — Homepage Visibility</h2>

        <div className="space-y-2">
          <Label>Header image</Label>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-md glass cursor-pointer hover:bg-muted/50 text-sm">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload image
              <input type="file" accept="image/*" className="hidden" onChange={onUploadHeader} disabled={uploading} />
            </label>
            {form.header_image_url && <img src={form.header_image_url} alt="" className="h-16 w-24 object-cover rounded-md" />}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input id="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="glass" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="glass min-h-20" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger className="glass"><SelectValue /></SelectTrigger>
              <SelectContent className="glass-strong">
                <SelectItem value="drugs">Drugs</SelectItem>
                <SelectItem value="disease">Disease</SelectItem>
                <SelectItem value="discovery">Discovery</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="section">Research section</Label>
            <Input id="section" value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} className="glass" placeholder="e.g. Oncology" />
          </div>
        </div>
      </section>

      <section className="glass-strong rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold">Section 2 — Content (Inside View)</h2>
        <RichEditor value={form.content_html} onChange={(html) => setForm({ ...form, content_html: html })} />
      </section>

      <Button type="submit" disabled={saving} className="gradient-bg text-primary-foreground hover:opacity-90 glow w-full md:w-auto">
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Publish research
      </Button>
    </form>
  );
}
