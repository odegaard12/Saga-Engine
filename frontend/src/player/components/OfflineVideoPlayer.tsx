import { useEffect, useRef, useState } from 'react'

export interface OfflineVideoPlayerProps {
  videoUrl: string
  onComplete: () => void
}

export function OfflineVideoPlayer({ videoUrl, onComplete }: OfflineVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {
        // Auto-play was blocked, wait for user interaction
      })
    }
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: '#000',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        controls={false}
        playsInline
        onPlay={() => setIsPlaying(true)}
        onEnded={onComplete}
        onError={() => {
          console.error('Video failed to load:', videoUrl)
          setError(true)
          onComplete() // Skip video if it fails
        }}
      />

      {!isPlaying && !error && (
        <button
          onClick={() => videoRef.current?.play()}
          style={{
            position: 'absolute',
            padding: '16px 32px',
            fontSize: 20,
            background: 'rgba(255, 255, 255, 0.2)',
            border: '2px solid white',
            borderRadius: 32,
            color: 'white',
            backdropFilter: 'blur(8px)',
            cursor: 'pointer',
          }}
        >
          ▶️ Empezar Historia
        </button>
      )}

      <button
        onClick={onComplete}
        style={{
          position: 'absolute',
          top: 24,
          right: 24,
          padding: '8px 16px',
          background: 'rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: 20,
          color: 'white',
          fontSize: 14,
        }}
      >
        Saltar ⏭️
      </button>
    </div>
  )
}
