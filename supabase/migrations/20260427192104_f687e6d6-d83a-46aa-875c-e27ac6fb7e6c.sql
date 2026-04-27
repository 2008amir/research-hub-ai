-- Auto-grant admin role to ecomedicsquad@gmail.com on signup or update existing
CREATE OR REPLACE FUNCTION public.grant_admin_for_special_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email = 'ecomedicsquad@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grant_admin_special_email ON auth.users;
CREATE TRIGGER grant_admin_special_email
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_admin_for_special_email();

-- Backfill: if the special user already exists, grant admin now
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users
WHERE email = 'ecomedicsquad@gmail.com'
ON CONFLICT DO NOTHING;