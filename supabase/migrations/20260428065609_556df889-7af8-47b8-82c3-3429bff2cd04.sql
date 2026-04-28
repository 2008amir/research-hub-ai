CREATE OR REPLACE FUNCTION public.get_my_auth_state()
RETURNS TABLE(profile jsonb, is_admin boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (
      SELECT to_jsonb(p)
      FROM public.profiles p
      WHERE p.id = auth.uid()
    ) AS profile,
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'::public.app_role
    ) AS is_admin;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_auth_state() TO authenticated;

NOTIFY pgrst, 'reload schema';