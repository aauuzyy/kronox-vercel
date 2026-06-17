import { useState, useEffect, useCallback } from 'react'
import { fetchCatalog as fetchCatalogFromSupabase, fetchMyLikes, toggleLike as toggleLikeSupabase } from '../supabase.js'
import { getGuestId } from '../lib/stats.js'
import { calcDifficulty } from '../constants.js'

export function useCatalog({ sortBy: initialSortBy = 'newest' } = {}) {
  const [songs, setSongs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [myLikes, setMyLikes] = useState(new Set())
  const [sortBy, setSortBy] = useState(initialSortBy)

  const guestId = getGuestId()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [catalog, likes] = await Promise.all([
        fetchCatalogFromSupabase({ sortBy }),
        fetchMyLikes(guestId),
      ])

      if (sortBy === 'difficulty') {
        catalog.sort((a, b) => {
          const da = calcDifficulty(a.chart, a.bpm, a.subdivision)
          const db = calcDifficulty(b.chart, b.bpm, b.subdivision)
          return db - da
        })
      }

      setSongs(catalog)
      setMyLikes(likes)
    } catch (err) {
      setSongs([])
      setError(err.message || 'Failed to load catalog')
    } finally {
      setLoading(false)
    }
  }, [sortBy, guestId])

  useEffect(() => {
    load()
  }, [load])

  const toggleLike = useCallback(async (song) => {
    const nowLiked = await toggleLikeSupabase(song.id, guestId)

    setMyLikes(prev => {
      const next = new Set(prev)
      if (nowLiked) next.add(song.id)
      else next.delete(song.id)
      return next
    })

    setSongs(prev =>
      prev.map(s =>
        s.id === song.id
          ? { ...s, likes: Math.max(0, (s.likes || 0) + (nowLiked ? 1 : -1)) }
          : s
      )
    )

    return nowLiked
  }, [guestId])

  return { songs, loading, error, myLikes, toggleLike, sortBy, setSortBy, reload: load }
}
