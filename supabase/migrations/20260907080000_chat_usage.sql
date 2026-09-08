-- Studio Sensei — free-tier question quota for Sensei chat.
-- Free users get a lifetime allowance of questions; the Paddle webhook (or an
-- admin override) grants the "paid" role which lifts the cap. The counter is
-- authoritative and lives in the sensei-chat edge function (service role only).

create table public.chat_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  questions_used int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.chat_usage enable row level security;

-- Users can read their own usage (for the free-plan counter in the UI).
create policy "Users view own chat usage"
  on public.chat_usage for select
  using (auth.uid() = user_id);

-- Atomic increment used by the sensei-chat edge function. Service role only;
-- authenticated users can never mint free questions for themselves.
create or replace function public.bump_chat_questions(_user_id uuid)
returns int
language sql
set search_path = public
as $$
  insert into public.chat_usage (user_id, questions_used)
  values (_user_id, 1)
  on conflict (user_id)
  do update set questions_used = public.chat_usage.questions_used + 1,
                updated_at = now()
  returning questions_used;
$$;

revoke all on function public.bump_chat_questions(uuid) from public, anon, authenticated;
grant execute on function public.bump_chat_questions(uuid) to service_role;
