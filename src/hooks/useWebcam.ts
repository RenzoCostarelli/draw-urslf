import { useEffect, useRef } from 'react'

/**
 * Creates and manages a shared webcam video element.
 * Returns a ref so both the Three.js scene and hand tracker can use the same stream.
 */
export function useWebcam() {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const video = document.createElement('video')
    video.autoplay = true
    video.muted = true
    video.playsInline = true
    Object.assign(video.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      opacity: '0',
      pointerEvents: 'none',
    })
    document.body.appendChild(video)
    videoRef.current = video

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then((stream) => {
        video.srcObject = stream
        video.play()
      })
      .catch((err) => console.error('Webcam error:', err))

    return () => {
      if (video.srcObject) {
        const stream = video.srcObject as MediaStream
        stream.getTracks().forEach((t) => t.stop())
      }
      document.body.removeChild(video)
      videoRef.current = null
    }
  }, [])

  return videoRef
}
