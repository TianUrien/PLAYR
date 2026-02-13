import { useState, useRef, useCallback, useEffect } from 'react'
import { Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react'

interface FeedVideoPlayerProps {
  src: string
  poster?: string | null
  className?: string
}

export function FeedVideoPlayer({ src, poster, className = '' }: FeedVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [showControls, setShowControls] = useState(true)
  const [hasStarted, setHasStarted] = useState(false)
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Intersection Observer: pause when scrolled out of view
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting && !video.paused) {
          video.pause()
          setIsPlaying(false)
        }
      },
      { threshold: 0.25 }
    )

    observer.observe(video)
    return () => observer.disconnect()
  }, [])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    if (video.paused) {
      video.play()
      setIsPlaying(true)
      setHasStarted(true)
    } else {
      video.pause()
      setIsPlaying(false)
    }
  }, [])

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setIsMuted(video.muted)
  }, [])

  const handleFullscreen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const container = containerRef.current
    if (!container) return

    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      container.requestFullscreen()
    }
  }, [])

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current
    if (!video || !duration) return
    setCurrentTime(video.currentTime)
    setProgress((video.currentTime / duration) * 100)
  }, [duration])

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    setDuration(video.duration)
  }, [])

  const handleEnded = useCallback(() => {
    setIsPlaying(false)
    setProgress(0)
    setCurrentTime(0)
  }, [])

  const handleProgressClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const video = videoRef.current
    const bar = progressRef.current
    if (!video || !bar || !duration) return

    const rect = bar.getBoundingClientRect()
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    video.currentTime = percent * duration
  }, [duration])

  const handleMouseMove = useCallback(() => {
    setShowControls(true)
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current)
    if (isPlaying) {
      hideControlsTimer.current = setTimeout(() => setShowControls(false), 2500)
    }
  }, [isPlaying])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div
      ref={containerRef}
      className={`relative bg-black overflow-hidden cursor-pointer select-none ${className}`}
      onClick={togglePlay}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster || undefined}
        muted={isMuted}
        playsInline
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        className="w-full h-full object-contain"
      />

      {/* Large center play button (before first play) */}
      {!hasStarted && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors">
            <Play className="w-8 h-8 text-white ml-1" fill="white" />
          </div>
        </div>
      )}

      {/* Controls overlay */}
      {hasStarted && (
        <div
          className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent pt-8 pb-2 px-3 transition-opacity duration-200 ${
            showControls ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Progress bar */}
          <div
            ref={progressRef}
            className="w-full h-1.5 bg-white/30 rounded-full cursor-pointer mb-2 group"
            onClick={handleProgressClick}
          >
            <div
              className="h-full bg-white rounded-full relative transition-all"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>

          {/* Controls row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); togglePlay() }}
                className="text-white hover:text-white/80 transition-colors"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5" fill="white" />
                ) : (
                  <Play className="w-5 h-5 ml-0.5" fill="white" />
                )}
              </button>

              <button
                type="button"
                onClick={toggleMute}
                className="text-white hover:text-white/80 transition-colors"
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? (
                  <VolumeX className="w-5 h-5" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </button>

              <span className="text-xs text-white/80 font-mono tabular-nums">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <button
              type="button"
              onClick={handleFullscreen}
              className="text-white hover:text-white/80 transition-colors"
              aria-label="Fullscreen"
            >
              <Maximize className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
