import { useEffect, useState } from 'react'

const DB_NAME = 'kronox'
const DB_VERSION = 1
const STORE_NAME = 'audio'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = e => resolve(e.target.result)
    req.onerror = () => reject(req.error)
  })
}

export function useAudioFile() {
  const [savedFile, setSavedFile] = useState(null)

  useEffect(() => {
    openDB().then(db => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get('song')
      req.onsuccess = () => setSavedFile(req.result || null)
    }).catch(() => setSavedFile(null))
  }, [])

  const saveAudioFile = async (file) => {
    try {
      const db = await openDB()
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(file, 'song')
      setSavedFile(file)
    } catch (err) {
      console.warn('Failed to save audio to IndexedDB', err)
    }
  }

  return { savedFile, saveAudioFile }
}
