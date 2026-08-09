import { useState, useEffect } from 'react'

export function useGyroParallax(intensity: number = 10) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.DeviceOrientationEvent) return

    let lastGamma = 0
    let lastBeta = 0

    const handleOrientation = (event: DeviceOrientationEvent) => {
      // gamma is the left-to-right tilt in degrees, where right is positive
      // beta is the front-to-back tilt in degrees, where front is positive
      let { gamma, beta } = event

      if (gamma === null || beta === null) return

      // Smooth the values to prevent jitter
      gamma = lastGamma + (gamma - lastGamma) * 0.1
      beta = lastBeta + (beta - lastBeta) * 0.1

      lastGamma = gamma
      lastBeta = beta

      // Clamp values
      const maxTilt = 45
      const clampedGamma = Math.max(-maxTilt, Math.min(maxTilt, gamma))
      const clampedBeta = Math.max(-maxTilt, Math.min(maxTilt, beta))

      // Normalize to -1..1
      const normalizedX = clampedGamma / maxTilt
      const normalizedY = clampedBeta / maxTilt

      setTilt({
        x: normalizedX * intensity,
        y: normalizedY * intensity,
      })
    }

    window.addEventListener('deviceorientation', handleOrientation)
    return () => window.removeEventListener('deviceorientation', handleOrientation)
  }, [intensity])

  const transform = `perspective(1000px) rotateX(${-tilt.y}deg) rotateY(${tilt.x}deg)`

  return { tilt, transform }
}
