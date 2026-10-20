-- Supabase SQL Editor에 통째로 붙여넣고 Run. 여러 번 돌려도 안전 (if not exists / drop policy if exists).
-- ===== 기록 동기화 =====
-- 기록 하나(운동·루틴·신체·직접 만든 운동·설정) = 한 행. k: 'w:<id>' 'r:<id>' 'b:<날짜>' 'c:<이름>' 'set'
-- u: 기기에서 고친 시각(ms). v가 null이면 삭제 표시. updated_at: 서버가 받은 시각 (기기는 이걸로 바뀐 것만 받음)
create table if not exists public.gymlog_recs (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  k text not null check (char_length(k) <= 200),
  v jsonb check (v is null or octet_length(v::text) < 500000),
  u bigint not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, k)
);
create index if not exists gymlog_recs_user_time on public.gymlog_recs (user_id, updated_at);
alter table public.gymlog_recs enable row level security;
drop policy if exists "own row" on public.gymlog_recs;
create policy "own row" on public.gymlog_recs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update on public.gymlog_recs to authenticated;
-- 올리기: 서버에 있는 것보다 새 것(u가 큰 것)만 씀. 조회하는 사람 권한으로 실행 (RLS 적용)
create or replace function public.gymlog_push(rows jsonb) returns void
language sql security invoker set search_path = '' as $$
  insert into public.gymlog_recs (user_id, k, v, u)
  select (select auth.uid()), r->>'k', case when jsonb_typeof(r->'v') = 'null' then null else r->'v' end, (r->>'u')::bigint
  from jsonb_array_elements(rows) r
  on conflict (user_id, k) do update set v = excluded.v, u = excluded.u, updated_at = now()
  where public.gymlog_recs.u < excluded.u;
$$;
revoke execute on function public.gymlog_push(jsonb) from public, anon;
grant execute on function public.gymlog_push(jsonb) to authenticated;

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

-- 목록용: 가져간 사람 수와 평균 별점을 붙인 뷰 (조회하는 사람 권한으로 실행). 아래 '신고 · 숨김'에서 숨김 조건을 넣어 다시 정의함
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

-- ===== 탈퇴 =====
-- 내 계정 삭제. auth.users에서 지우면 기록·공유 프로그램·별점·신고·의견이 전부 함께 지워짐 (on delete cascade)
create or replace function public.gymlog_delete_me() returns void
language sql security definer set search_path = '' as $$
  delete from auth.users where id = (select auth.uid());
$$;
revoke execute on function public.gymlog_delete_me() from public, anon;
grant execute on function public.gymlog_delete_me() to authenticated;

-- ===== 신고 · 숨김 =====
-- 3명이 신고하면 hidden = true (목록에서 사라짐, 올린 사람에게만 보임). hidden은 사용자가 못 바꾸고 관리자만 바꿈
alter table public.gymlog_programs add column if not exists hidden boolean not null default false;
revoke update on public.gymlog_programs from authenticated;
grant update (user_id, author, badge, photo, name, descr, days, updated_at) on public.gymlog_programs to authenticated;
create table if not exists public.gymlog_reports (
  program_id uuid not null references public.gymlog_programs on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  reason text not null check (reason in ('spam', 'abuse', 'sexual', 'copyright', 'etc')),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  primary key (program_id, user_id)
);
alter table public.gymlog_reports enable row level security;
drop policy if exists "own insert" on public.gymlog_reports;
create policy "own insert" on public.gymlog_reports for insert to authenticated
  with check ((select auth.uid()) = user_id and not exists (select 1 from public.gymlog_programs p where p.id = program_id and p.user_id = (select auth.uid())));
drop policy if exists "own read" on public.gymlog_reports;
create policy "own read" on public.gymlog_reports for select to authenticated using ((select auth.uid()) = user_id);
grant select, insert on public.gymlog_reports to authenticated;
create or replace function public.gymlog_report_hide() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.gymlog_programs set hidden = true
  where id = new.program_id and (select count(*) from public.gymlog_reports where program_id = new.program_id) >= 3;
  return new;
end $$;
drop trigger if exists gymlog_report_hide on public.gymlog_reports;
create trigger gymlog_report_hide after insert on public.gymlog_reports for each row execute function public.gymlog_report_hide();
-- 목록 뷰: 숨겨진 건 올린 사람만 봄
create or replace view public.gymlog_programs_v with (security_invoker = true) as
  select p.id, p.user_id, p.author, p.name, p.descr, p.days, p.updated_at,
    count(*) filter (where v.used) as uses, round(avg(v.rating), 1) as rating, count(v.rating) as ratings, p.badge, p.photo, p.hidden
  from public.gymlog_programs p left join public.gymlog_program_votes v on v.program_id = p.id
  where not p.hidden or p.user_id = (select auth.uid())
  group by p.id;
grant select on public.gymlog_programs_v to authenticated;
