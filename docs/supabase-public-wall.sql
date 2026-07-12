create table if not exists public.public_lost_notes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  content text not null,
  city text not null default '匿名归途',
  likes integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.public_lost_notes enable row level security;

drop policy if exists "public_lost_notes_select_all" on public.public_lost_notes;
create policy "public_lost_notes_select_all"
on public.public_lost_notes
for select
to anon
using (true);

drop policy if exists "public_lost_notes_insert_anon" on public.public_lost_notes;
create policy "public_lost_notes_insert_anon"
on public.public_lost_notes
for insert
to anon
with check (
  char_length(user_id) between 4 and 80
  and char_length(content) between 1 and 280
  and char_length(city) between 1 and 40
);
