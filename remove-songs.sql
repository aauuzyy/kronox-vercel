-- Run in: Supabase Dashboard → SQL Editor → New query → Run

SELECT id, title, creator, published_at FROM charts WHERE title ILIKE '%Echos%Memoria%' ORDER BY published_at;
