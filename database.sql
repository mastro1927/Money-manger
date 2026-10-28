-- MONEY MANAGER: database privato per account separati
-- Incolla TUTTO questo script nel Supabase SQL Editor e premi Run.

create table if not exists public.money_manager_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  starting_balance numeric(12,2) not null default 0 check (starting_balance >= 0 and starting_balance <= 100000000),
  goal numeric(12,2) not null default 0 check (goal >= 0 and goal <= 100000000),
  updated_at timestamptz not null default now()
);

create table if not exists public.money_manager_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income','expense')),
  amount numeric(12,2) not null check (amount > 0 and amount <= 100000000),
  category text not null default 'Altro' check (char_length(category) <= 50),
  description text not null default '' check (char_length(description) <= 100),
  movement_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists money_manager_movements_user_date_idx
  on public.money_manager_movements (user_id, movement_date desc);

-- Protezione principale: abilita Row Level Security su entrambe le tabelle.
alter table public.money_manager_settings enable row level security;
alter table public.money_manager_movements enable row level security;

-- Rimuovi eventuali policy con gli stessi nomi per rendere lo script ri-eseguibile.
drop policy if exists "Users manage their own settings" on public.money_manager_settings;
drop policy if exists "Users read their own settings" on public.money_manager_settings;
drop policy if exists "Users insert their own settings" on public.money_manager_settings;
drop policy if exists "Users update their own settings" on public.money_manager_settings;
drop policy if exists "Users read their own movements" on public.money_manager_movements;
drop policy if exists "Users insert their own movements" on public.money_manager_movements;
drop policy if exists "Users update their own movements" on public.money_manager_movements;
drop policy if exists "Users delete their own movements" on public.money_manager_movements;

create policy "Users read their own settings"
  on public.money_manager_settings for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert their own settings"
  on public.money_manager_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update their own settings"
  on public.money_manager_settings for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users read their own movements"
  on public.money_manager_movements for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert their own movements"
  on public.money_manager_movements for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update their own movements"
  on public.money_manager_movements for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete their own movements"
  on public.money_manager_movements for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Niente accesso anonimo; gli utenti autenticati passano comunque dalle policy RLS.
revoke all on table public.money_manager_settings from anon, authenticated;
revoke all on table public.money_manager_movements from anon, authenticated;
grant select, insert, update on table public.money_manager_settings to authenticated;
grant select, insert, update, delete on table public.money_manager_movements to authenticated;
