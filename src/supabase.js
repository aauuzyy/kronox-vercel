import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

let _client = null

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_URL === 'undefined' || SUPABASE_KEY === 'undefined') {
    throw new Error(
      'Supabase is not configured. Create a .env file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.\n' +
      'See .env.example for the required keys.'
    )
  }
  if (!_client) _client = createClient(SUPABASE_URL, SUPABASE_KEY)
  return _client
}

/**
 * Upload audio + chart to Supabase Storage & insert a row into the charts table.
 * Max audio file size: 15 MB.
 */
export async function publishChart({ audioFile, songTitle, bpm, subdivision, speed, chart, creator, duration }) {
  const sb = getClient()
  if (audioFile.size > 15 * 1024 * 1024) throw new Error('Audio file must be under 15 MB.')
  if (!songTitle?.trim()) throw new Error('Song title is required.')

  const safeName  = audioFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const audioPath = `${Date.now()}_${safeName}`

  const { error: uploadError } = await sb.storage.from('songs').upload(audioPath, audioFile)
  if (uploadError) throw uploadError

  const { data: { publicUrl } } = sb.storage.from('songs').getPublicUrl(audioPath)

  const { error: dbError } = await sb.from('charts').insert({
    title:           songTitle.trim(),
    creator,
    bpm:             Number(bpm),
    subdivision:     Number(subdivision),
    speed:           Number(speed),
    chart,
    audio_url:       publicUrl,
    audio_file_name: audioFile.name,
    duration:        Number(duration) || 0,
    plays:           0,
    published_at:    new Date().toISOString(),
  })
  if (dbError) throw dbError
}

/**
 * Fetch published charts.
 * sortBy: 'newest' (default) | 'plays'
 */
export async function fetchCatalog({ sortBy = 'newest', limitCount = 100 } = {}) {
  const sb = getClient()
  const { data, error } = await sb
    .from('charts')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(limitCount)
  if (error) throw error

  const results = (data || []).map(r => ({
    id:            r.id,
    title:         r.title,
    creator:       r.creator,
    bpm:           r.bpm,
    subdivision:   r.subdivision,
    speed:         r.speed,
    chart:         r.chart,
    audioUrl:      r.audio_url,
    audioFileName: r.audio_file_name,
    duration:      r.duration,
    plays:         r.plays,
    publishedAt:   new Date(r.published_at),
  }))

  if (sortBy === 'plays') results.sort((a, b) => (b.plays || 0) - (a.plays || 0))
  return results
}

/** Increment the play counter for a catalogued song (uses a DB function — see supabase-setup.sql). */
export async function incrementPlays(id) {
  try {
    const sb = getClient()
    await sb.rpc('increment_plays', { p_id: id })
  } catch { /* best-effort */ }
}
