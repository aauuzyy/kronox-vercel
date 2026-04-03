-- Run this entire file in: Supabase Dashboard → SQL Editor → New query → Run

-- 1. Charts table
create table if not exists charts (
  id               uuid primary key default gen_random_uuid(),
  title            text        not null,
  creator          text        not null,
  bpm              numeric     not null,
  subdivision      numeric     not null,
  speed            numeric     not null,
  chart            jsonb       not null,
  audio_url        text        not null,
  audio_file_name  text,
  duration         numeric     default 0,
  plays            integer     default 0,
  published_at     timestamptz default now()
);

-- 2. Allow anyone to read charts (public catalog)
alter table charts enable row level security;
create policy "Public read" on charts for select using (true);
create policy "Public insert" on charts for insert with check (true);

-- 3. Increment-plays function (safe atomic counter)
create or replace function increment_plays(p_id uuid)
returns void language sql security definer as $$
  update charts set plays = plays + 1 where id = p_id;
$$;

-- 4. Storage bucket (run this if you haven't created it via the dashboard)
-- Go to: Storage → New bucket → Name: "songs" → Public: ON
-- Or uncomment the line below (requires storage extension):
-- insert into storage.buckets (id, name, public) values ('songs', 'songs', true) on conflict do nothing;

-- 5. Storage policy — allow anyone to upload and read
create policy "Public upload" on storage.objects for insert with check (bucket_id = 'songs');
create policy "Public read"   on storage.objects for select using (bucket_id = 'songs');
