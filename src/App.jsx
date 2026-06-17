import { useState, useRef } from 'react'
import { TitleBar } from './components/layout/TitleBar.jsx'
import { ScreenWrapper } from './components/layout/ScreenWrapper.jsx'
import { SetupScreen } from './screens/SetupScreen.jsx'
import { GameScreen } from './screens/GameScreen.jsx'
import { ResultsScreen } from './screens/ResultsScreen.jsx'
import { CatalogScreen } from './screens/CatalogScreen.jsx'
import { SettingsModal } from './components/game/SettingsModal.jsx'
import { LeaderboardModal } from './components/game/LeaderboardModal.jsx'
import { HistoryModal } from './components/game/HistoryModal.jsx'
import { CalibrationModal } from './components/game/CalibrationModal.jsx'
import { PublishModal } from './components/game/PublishModal.jsx'
import { useSettings } from './hooks/useSettings.js'
import { calcGrade } from './constants.js'
import { addPlayerGameResult, saveHistoryEntry } from './lib/stats.js'
import './styles/base.css'

export default function App() {
  const { settings, update } = useSettings()
  const [screen, setScreen] = useState('setup')
  const [gameConfig, setGameConfig] = useState(null)
  const [gameStats, setGameStats] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showCalibrate, setShowCalibrate] = useState(false)
  const [showPublish, setShowPublish] = useState(false)
  const [publishConfig, setPublishConfig] = useState(null)
  const catalogAudioRef = useRef(null)

  const handleOpenCatalog = () => {
    if (!catalogAudioRef.current) {
      const a = new Audio()
      a.style.display = 'none'
      a.preload = 'auto'
      a.muted = false
      a.volume = 0.001
      a.src = 'data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'
      document.body.appendChild(a)
      a.play().catch(() => {})
      catalogAudioRef.current = a
    }
    setScreen('catalog')
  }

  const handleStart = (cfg) => {
    setGameConfig({
      ...cfg,
      keybinds: settings.keybinds,
      laneColors: settings.laneColors,
      sfxVolume: settings.sfxVolume,
      musicVolume: settings.musicVolume,
      pauseKey: settings.pauseKey,
      scrollDown: settings.scrollDown,
      audioOffset: settings.audioOffset,
      showStars: settings.showStars,
      starColor: settings.starColor,
    })
    setScreen('game')
  }

  const handleGameStop = (status, stats) => {
    if (status === 'preview') {
      setScreen('setup')
      return
    }
    if (status === 'complete') {
      const grade = calcGrade(stats.accuracy)
      if (!gameConfig?.autoplay) {
        addPlayerGameResult(stats)
        saveHistoryEntry({
          songTitle: stats.songTitle,
          grade,
          score: stats.score,
          accuracy: stats.accuracy,
          date: new Date().toLocaleDateString(),
          perfect: stats.perfect,
          good: stats.good,
          bad: stats.bad,
          miss: stats.miss,
        })
      }
      setGameStats({ ...stats, grade, autoplay: gameConfig?.autoplay })
      setScreen('results')
    } else {
      setScreen('setup')
    }
  }

  const handlePlayAgain = () => {
    setGameStats(null)
    setScreen('game')
  }

  const buildGameConfig = (song, autoplay = false, preview = false) => ({
    audioUrl: song.audioUrl,
    songTitle: song.title,
    bpm: song.bpm,
    subdivision: song.subdivision,
    speed: settings.speed,
    chart: song.chart,
    autoplay,
    keybinds: settings.keybinds,
    laneColors: settings.laneColors,
    sfxVolume: settings.sfxVolume,
    musicVolume: settings.musicVolume,
    pauseKey: settings.pauseKey,
    scrollDown: settings.scrollDown,
    audioOffset: settings.audioOffset,
    showStars: settings.showStars,
    starColor: settings.starColor,
    flashOpacity: settings.flashOpacity,
    flashColor: settings.flashColor,
    ...(preview && song.duration
      ? { audioStartOffset: Math.max(0, song.duration / 2 - 7.5), previewDuration: 15000 }
      : {}),
  })

  const buildPreviewConfig = (song, audioElement = null) => ({
    audioElement,
    audioUrl: song.audioUrl,
    songTitle: song.title,
    bpm: song.bpm,
    subdivision: song.subdivision,
    speed: settings.speed,
    chart: song.chart,
    autoplay: true,
    disableInput: true,
    isPreview: true,
    useSimpleAudio: true,
    keybinds: settings.keybinds,
    laneColors: settings.laneColors,
    sfxVolume: settings.sfxVolume,
    musicVolume: settings.musicVolume,
    pauseKey: settings.pauseKey,
    scrollDown: settings.scrollDown,
    audioOffset: 0,
    showStars: settings.showStars,
    starColor: settings.starColor,
    flashOpacity: settings.flashOpacity,
    flashColor: settings.flashColor,
    audioStartOffset: 0,
  })

  const handlePlayFromCatalog = (song, autoplay = false) => {
    setGameConfig(buildGameConfig(song, autoplay, false))
    setScreen('game')
  }

  const handlePreviewFromCatalog = (song) => {
    setGameConfig(buildGameConfig(song, true, true))
    setScreen('game')
  }

  return (
    <div className="app-root">
      {screen !== 'catalog' && (
        <TitleBar
          settingsOpen={showSettings}
          onToggleSettings={() => setShowSettings(o => !o)}
          onOpenCatalog={handleOpenCatalog}
          onOpenLeaderboard={() => setShowLeaderboard(true)}
          onOpenHistory={() => setShowHistory(true)}
          onOpenCalibrate={() => setShowCalibrate(true)}
        />
      )}

      <ScreenWrapper>
        {screen === 'setup' && (
          <SetupScreen
            settings={settings}
            onStart={handleStart}
            onOpenPublish={cfg => { setPublishConfig(cfg); setShowPublish(true) }}
          />
        )}
        {screen === 'game' && gameConfig && (
          <GameScreen config={gameConfig} onStop={handleGameStop} />
        )}
        {screen === 'results' && gameStats && (
          <ResultsScreen
            stats={gameStats}
            onExit={() => { setScreen('setup'); setGameStats(null) }}
            onPlayAgain={handlePlayAgain}
          />
        )}
        {screen === 'catalog' && (
          <CatalogScreen
            audioRef={catalogAudioRef}
            buildPreviewConfig={buildPreviewConfig}
            onPlay={handlePlayFromCatalog}
            onBack={() => setScreen('setup')}
          />
        )}
      </ScreenWrapper>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onChange={update}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showLeaderboard && (
        <LeaderboardModal onClose={() => setShowLeaderboard(false)} />
      )}

      {showHistory && (
        <HistoryModal onClose={() => setShowHistory(false)} />
      )}

      {showCalibrate && (
        <CalibrationModal
          offset={settings.audioOffset}
          onChange={update}
          onClose={() => setShowCalibrate(false)}
        />
      )}

      {showPublish && publishConfig && (
        <PublishModal
          config={publishConfig}
          onClose={() => { setShowPublish(false); setPublishConfig(null) }}
        />
      )}
    </div>
  )
}
