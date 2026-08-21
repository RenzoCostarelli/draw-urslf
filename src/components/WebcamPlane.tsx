import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

interface WebcamPlaneProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
}

export default function WebcamPlane({ videoRef }: WebcamPlaneProps) {
  const { scene } = useThree()

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let texture: THREE.VideoTexture | null = null

    const setup = () => {
      texture = new THREE.VideoTexture(video)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.repeat.set(-1, 1)
      texture.offset.set(1, 0)
      scene.background = texture
    }

    if (video.readyState >= 2) {
      setup()
    } else {
      video.addEventListener('canplay', setup, { once: true })
    }

    return () => {
      texture?.dispose()
      scene.background = null
    }
  }, [scene, videoRef])

  return null
}
