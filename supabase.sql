-- Supabase SQL Editor에 통째로 붙여넣고 Run. 여러 번 돌려도 안전 (if not exists / drop policy if exists).
-- 기록 동기화: 유저당 한 행에 전체 기록(jsonb) 저장.
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


-- ===== 프로그램 공유 =====
-- 루틴 폴더 하나 = 프로그램. 로그인한 사용자 누구나 읽기, 쓰기·삭제는 본인 것만
create table if not exists public.gymlog_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  author text not null check (char_length(author) between 1 and 30),
  name text not null check (char_length(name) between 1 and 60),
  descr text not null default '' check (char_length(descr) <= 500),
  days jsonb not null check (octet_length(days::text) < 200000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);
alter table public.gymlog_programs enable row level security;
drop policy if exists "read all" on public.gymlog_programs;
create policy "read all" on public.gymlog_programs for select to authenticated using (true);
drop policy if exists "own row" on public.gymlog_programs;
create policy "own row" on public.gymlog_programs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter table public.gymlog_programs add column if not exists badge text not null default '' check (char_length(badge) <= 80);  -- 올린 사람 대표 뱃지
alter table public.gymlog_programs add column if not exists photo text not null default '' check (char_length(photo) <= 40000 and (photo = '' or photo like 'data:image/jpeg;base64,%'));  -- 올린 사람 프로필 사진 (160px JPEG)
grant select, insert, update, delete on public.gymlog_programs to authenticated;

-- 가져감·별점: 사람당 프로그램마다 한 행이라 여러 번 가져가도 1명으로 셈.
-- 별점은 가져간 사람만, 자기 프로그램에는 못 줌
create table if not exists public.gymlog_program_votes (
  program_id uuid not null references public.gymlog_programs on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  used boolean not null default false,
  rating smallint check (rating between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (program_id, user_id),
  check (rating is null or used)
);
alter table public.gymlog_program_votes enable row level security;
drop policy if exists "read all" on public.gymlog_program_votes;
create policy "read all" on public.gymlog_program_votes for select to authenticated using (true);
drop policy if exists "own vote" on public.gymlog_program_votes;
create policy "own vote" on public.gymlog_program_votes for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and not exists (select 1 from public.gymlog_programs p where p.id = program_id and p.user_id = (select auth.uid())));
grant select, insert, update on public.gymlog_program_votes to authenticated;

-- 목록용: 가져간 사람 수와 평균 별점을 붙인 뷰 (조회하는 사람 권한으로 실행)
create or replace view public.gymlog_programs_v with (security_invoker = true) as
  select p.id, p.user_id, p.author, p.name, p.descr, p.days, p.updated_at,
    count(*) filter (where v.used) as uses, round(avg(v.rating), 1) as rating, count(v.rating) as ratings, p.badge, p.photo
  from public.gymlog_programs p left join public.gymlog_program_votes v on v.program_id = p.id
  group by p.id;
grant select on public.gymlog_programs_v to authenticated;

-- ===== 의견 보내기 =====
-- 사용자는 쓰기와 자기 글 읽기만. 개발자는 대시보드 Table Editor에서 status·reply를 고치면 앱의 "내 의견"에 보임
create table if not exists public.gymlog_feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('bug', 'idea', 'etc')),
  body text not null check (char_length(body) between 1 and 2000),
  app_ver text not null default '',
  ua text not null default '',
  status text not null default 'new' check (status in ('new', 'seen', 'done', 'wont')),
  reply text not null default '',
  created_at timestamptz not null default now()
);
alter table public.gymlog_feedback enable row level security;
drop policy if exists "own insert" on public.gymlog_feedback;
create policy "own insert" on public.gymlog_feedback for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'new' and reply = '');
drop policy if exists "own read" on public.gymlog_feedback;
create policy "own read" on public.gymlog_feedback for select to authenticated using ((select auth.uid()) = user_id);
grant select, insert on public.gymlog_feedback to authenticated;
