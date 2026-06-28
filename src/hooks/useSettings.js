import { useState, useEffect, useCallback } from 'react'
import { STORAGE_KEYS, SETTINGS_DEFAULTS, normalizeLaneSettings } from '../constants.js'

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings)
    const parsed = raw ? JSON.parse(raw) : {}
    return normalizeLaneSettings({ ...SETTINGS_DEFAULTS, ...parsed })
  } catch {
    return normalizeLaneSettings({ ...SETTINGS_DEFAULTS })
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings))
  } catch {
    /* ignore quota errors */
  }
}

export function useSettings() {
  const [settings, setSettings] = useState(() => loadSettings())

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  const update = useCallback((patch) => {
    setSettings(prev => normalizeLaneSettings({ ...prev, ...patch }))
  }, [])

  const reset = useCallback(() => {
    setSettings(normalizeLaneSettings({ ...SETTINGS_DEFAULTS }))
  }, [])

  return { settings, update, reset }
}
