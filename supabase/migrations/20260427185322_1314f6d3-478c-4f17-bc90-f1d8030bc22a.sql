
-- Drop broad public-read policies
drop policy if exists "Avatars publicly readable" on storage.objects;
drop policy if exists "Research images publicly readable" on storage.objects;

-- Keep buckets public for direct CDN access via getPublicUrl, but disable LIST/SELECT through the API
-- (Public CDN URLs still work; only API-based listing is blocked.)

-- Revoke EXECUTE on SECURITY DEFINER functions from anon and authenticated
revoke execute on function public.has_role(uuid, public.app_role) from anon, authenticated, public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;
