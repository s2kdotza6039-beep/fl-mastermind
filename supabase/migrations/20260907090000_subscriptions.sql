-- Studio Sensei — Paddle Billing subscriptions (self-serve Pro membership).
-- Paddle is the Merchant of Record: it handles the $10/mo USD checkout, global
-- sales tax and card processing. The paddle-webhook edge function grants/revokes
-- the "paid" role using the service role (mirroring admin-set-role).

-- ============ subscriptions ============
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'past_due', 'paused', 'cancelled', 'ended')),
  paddle_transaction_id text,
  paddle_customer_id text,
  paddle_subscription_id text,
  paddle_price_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_user_id_idx on public.subscriptions (user_id);
create index subscriptions_email_idx on public.subscriptions (lower(email));
create index subscriptions_customer_id_idx on public.subscriptions (paddle_customer_id);
create index subscriptions_subscription_id_idx on public.subscriptions (paddle_subscription_id);

create trigger update_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.update_updated_at_column();

alter table public.subscriptions enable row level security;

-- Users can read their own subscription; admins can read all (subscriber list).
-- No user-facing write policies: only the service role (edge functions) mutates.
create policy "Users view own subscriptions"
  on public.subscriptions for select
  using (auth.uid() = user_id);

create policy "Admins view all subscriptions"
  on public.subscriptions for select
  using (public.has_role(auth.uid(), 'admin'));

-- ============ billing_events (webhook audit trail + idempotency) ============
create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  event_id text not null,
  reference text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  unique (event, event_id)
);

alter table public.billing_events enable row level security;

create policy "Admins view billing events"
  on public.billing_events for select
  using (public.has_role(auth.uid(), 'admin'));
