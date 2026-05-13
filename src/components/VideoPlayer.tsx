import { useRef, useEffect, useState } from 'react'
import { Play, Pause, SkipForward, SkipBack, FastForward } from 'lucide-react'

interface VideoPlayerProps {
  src: string
  fps?: number
  onMarkSplit?: (time: number) => void
  onTimeUpdate?: (time: number) => void
  nextExpectedTime?: number
}

export function VideoPlayer({ src, fps = 60, onMarkSplit, onTimeUpdate, nextExpectedTime }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const updateTime = () => {
      setCurrentTime(video.currentTime)
      onTimeUpdate?.(video.currentTime)
    }
    video.addEventListener('timeupdate', updateTime)
    video.addEventListener('loadedmetadata', () => setDuration(video.duration))

    return () => {
      video.removeEventListener('timeupdate', updateTime)
    }
  }, [src])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return

      if (e.key === 'ArrowRight') {
        if (e.shiftKey) stepFrame(1)
        else stepTime(1)
      } else if (e.key === 'ArrowLeft') {
        if (e.shiftKey) stepFrame(-1)
        else stepTime(-1)
      } else if (e.key === ' ') {
        e.preventDefault()
        togglePlay()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPlaying, fps]) // Dependencies to ensure current state is captured if needed

  const togglePlay = () => {
    if (videoRef.current?.paused) {
      videoRef.current.play()
      setIsPlaying(true)
    } else {
      videoRef.current?.pause()
      setIsPlaying(false)
    }
  }

  const stepFrame = (frames: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime += frames / fps
    }
  }

  const stepTime = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime += seconds
    }
  }

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60)
    const secs = (time % 60).toFixed(3)
    return `${mins}:${secs.padStart(6, '0')}`
  }

  return (
    <div className="video-player-container">
      <video 
        key={src}
        ref={videoRef} 
        src={src} 
        className="main-video"
        onClick={togglePlay}
      />
      
      <div className="video-controls">
        <div className="time-info">
          <span className="current-time">{formatTime(currentTime)}</span>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${(currentTime / duration) * 100}%` }}
            />
          </div>
          <span className="duration">{formatTime(duration)}</span>
        </div>

        <div className="control-buttons">
          <button onClick={() => stepTime(-1)} title="Back 1s"><SkipBack size={20} /></button>
          <button onClick={() => stepFrame(-1)} title="Back 1 frame"><SkipBack size={16} /></button>
          
          <button className="play-btn" onClick={togglePlay}>
            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
          </button>
          
          <button onClick={() => stepFrame(1)} title="Forward 1 frame (Shift+Right)"><SkipForward size={16} /></button>
          <button onClick={() => stepTime(1)} title="Forward 1s (Right)"><SkipForward size={20} /></button>
          
          <div className="divider" />
          
          <button 
            className="btn-skip-expected" 
            disabled={!nextExpectedTime}
            onClick={() => stepTime(nextExpectedTime || 0)}
          >
            Skip to next split (+{nextExpectedTime}s)
          </button>
        </div>
      </div>
    </div>
  )
}
