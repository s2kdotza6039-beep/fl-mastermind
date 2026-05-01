-- ============ ENUM ============
create type public.app_role as enum ('admin', 'paid', 'free');

-- ============ PROFILES ============
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- ============ USER ROLES ============
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

-- ============ has_role (security definer, no recursion) ============
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

-- ============ updated_at trigger ============
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger update_profiles_updated_at
before update on public.profiles
for each row execute function public.update_updated_at_column();

-- ============ Auto-create profile + free role on signup ============
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  insert into public.user_roles (user_id, role)
  values (new.id, 'free');

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ============ ACTIVITY LOGS ============
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index idx_activity_logs_user on public.activity_logs(user_id, created_at desc);
create index idx_activity_logs_event on public.activity_logs(event_type, created_at desc);

alter table public.activity_logs enable row level security;

-- ============ SECURITY ALERTS ============
create table public.security_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  severity text not null check (severity in ('low','medium','high','critical')),
  alert_type text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_security_alerts_unresolved on public.security_alerts(created_at desc) where resolved = false;

alter table public.security_alerts enable row level security;

-- ============ POLICIES: profiles ============
create policy "Users view own profile"
  on public.profiles for select
  using (auth.uid() = user_id);

create policy "Admins view all profiles"
  on public.profiles for select
  using (public.has_role(auth.uid(), 'admin'));

create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = user_id);

create policy "Users insert own profile"
  on public.profiles for insert
  with check (auth.uid() = user_id);

-- ============ POLICIES: user_roles ============
create policy "Users view own roles"
  on public.user_roles for select
  using (auth.uid() = user_id);

create policy "Admins view all roles"
  on public.user_roles for select
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins insert roles"
  on public.user_roles for insert
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins update roles"
  on public.user_roles for update
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins delete roles"
  on public.user_roles for delete
  using (public.has_role(auth.uid(), 'admin'));

-- ============ POLICIES: activity_logs ============
create policy "Users view own logs"
  on public.activity_logs for select
  using (auth.uid() = user_id);

create policy "Admins view all logs"
  on public.activity_logs for select
  using (public.has_role(auth.uid(), 'admin'));

create policy "Authenticated users insert own logs"
  on public.activity_logs for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Admins delete logs"
  on public.activity_logs for delete
  using (public.has_role(auth.uid(), 'admin'));

-- ============ POLICIES: security_alerts ============
create policy "Admins view alerts"
  on public.security_alerts for select
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins update alerts"
  on public.security_alerts for update
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins delete alerts"
  on public.security_alerts for delete
  using (public.has_role(auth.uid(), 'admin'));

create policy "Authenticated users insert alerts"
  on public.security_alerts for insert
  to authenticated
  with check (true);
