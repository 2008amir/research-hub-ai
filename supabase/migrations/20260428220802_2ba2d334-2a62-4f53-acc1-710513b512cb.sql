-- Create dedicated public bucket for research media (images + videos)
insert into storage.buckets (id, name, public)
values ('research-media', 'research-media', true)
on conflict (id) do nothing;

-- Public read access
create policy "Research media is publicly readable"
on storage.objects for select
using (bucket_id = 'research-media');

-- Admins can upload
create policy "Admins upload research media"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'research-media'
  and public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Admins can update their own files
create policy "Admins update research media"
on storage.objects for update
to authenticated
using (
  bucket_id = 'research-media'
  and public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Admins can delete
create policy "Admins delete research media"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'research-media'
  and public.has_role(auth.uid(), 'admin'::public.app_role)
);
