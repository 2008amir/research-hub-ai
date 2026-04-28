CREATE OR REPLACE FUNCTION public.get_any_admin_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id FROM public.user_roles WHERE role = 'admin'::public.app_role ORDER BY created_at ASC LIMIT 1;
$$;