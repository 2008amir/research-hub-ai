NOTIFY pgrst, 'reload schema';

INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'admin'::public.app_role
FROM public.profiles p
WHERE p.id = '6e0915e6-c64e-482d-883e-0112ee39b560'
ON CONFLICT (user_id, role) DO NOTHING;