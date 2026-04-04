-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- Removes specific songs from the catalog by exact title match.

DELETE FROM charts
WHERE title IN (
  'BANG BANG BANG',
  'Shepard of Fire',
  'Tool Assist (3.2x)',
  'Perfect Neglect (5.0x)'
);
