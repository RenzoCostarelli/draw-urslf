import { useEffect, useRef } from 'react'

/**
 * Creates and manages a shared webcam video element.
 * Returns a ref so both the Three.js scene and hand tracker can use the same stream.
 */
export function useWebcam(
  facingMode: 'user' | 'environment' = 'user',
  onError?: (error: unknown) => void,
) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onErrorRef.current = onError
  })

  useEffect(() => {
    // StrictMode mounts this effect twice in dev (mount -> cleanup -> mount).
    // The cleanup can run before getUserMedia resolves, so `cancelled` lets the
    // async callback know to stop that orphaned stream instead of attaching it -
    // iOS WebKit blacks out the video element when two camera streams end up
    // live at once.
    let cancelled = false
    let activeStream: MediaStream | null = null

    const video = document.createElement('video')
    video.autoplay = true
    video.muted = true
    video.playsInline = true
    Object.assign(video.style, {
      // iOS WebKit throttles decoding on near-zero-size video elements, leaving
      // the texture black even once the stream is playing. Keep it full-size
      // but pushed off-screen instead of shrinking it.
      position: 'fixed',
      top: '0',
      left: '-99999px',
      width: '640px',
      height: '480px',
      opacity: '0',
      pointerEvents: 'none',
    })
    document.body.appendChild(video)
    videoRef.current = video

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode,
          width: { ideal: isMobile ? 640 : 1280 },
          height: { ideal: isMobile ? 480 : 720 },
        },
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        activeStream = stream
        video.srcObject = stream
        return video.play()
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Webcam error:', err)
        onErrorRef.current?.(err)
      })

    return () => {
      cancelled = true
      activeStream?.getTracks().forEach((t) => t.stop())
      document.body.removeChild(video)
      videoRef.current = null
    }
  }, [facingMode])

  return videoRef
}
