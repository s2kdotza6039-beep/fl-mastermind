-- Ensure has_role is callable by clients (used inside RLS policies)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;

-- Grant admin role to the requesting user
INSERT INTO public.user_roles (user_id, role)
VALUES ('13936752-7155-45f4-971e-c358c3bef4b6', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;