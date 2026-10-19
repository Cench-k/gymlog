-- Supabase SQL Editor에 붙여넣고 Run. 유저당 한 행에 전체 기록(jsonb) 저장.
create table if not exists public.gymlog (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  rev bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.gymlog enable row level security;
drop policy if exists "own row" on public.gymlog;
create policy "own row" on public.gymlog for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.gymlog to authenticated;
