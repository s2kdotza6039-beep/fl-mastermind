-- Revoke direct API execute on definer functions
revoke execute on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.update_updated_at_column() from public, anon, authenticated;

-- Tighten security_alerts insert: must be self or null (anonymous suspicious event from edge fn via service role)
drop policy if exists "Authenticated users insert alerts" on public.security_alerts;
create policy "Users insert own alerts"
  on public.security_alerts for insert
  to authenticated
  with check (user_id is null or user_id = auth.uid());
