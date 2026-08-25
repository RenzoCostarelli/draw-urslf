import { useEffect, useRef, useCallback } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

interface WebcamPlaneProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
}

export default function WebcamPlane({ videoRef }: WebcamPlaneProps) {
  const { scene, size } = useThree()
  const textureRef = useRef<THREE.VideoTexture | null>(null)

  // Ajusta el UV mapping del background para "object-fit: cover" + espejo horizontal.
  // Se ejecuta al crear la textura y cada vez que cambia el tamaño del canvas.
  const applyAspect = useCallback(() => {
    const texture = textureRef.current
    const video = videoRef.current
    if (!texture || !video || !video.videoWidth) return

    const va = video.videoWidth / video.videoHeight   // aspect ratio del video
    const ca = size.width / size.height               // aspect ratio del canvas

    let sx: number, sy: number, ox: number, oy: number

    if (va > ca) {
      // Video más ancho que el canvas → fit height, crop width
      sx = ca / va
      sy = 1
      ox = (1 - sx) / 2
      oy = 0
    } else {
      // Video más alto que el canvas → fit width, crop height
      sx = 1
      sy = va / ca
      ox = 0
      oy = (1 - sy) / 2
    }

    // repeat.x negativo = espejo horizontal; offset.x = sx + ox mantiene el crop centrado tras el flip
    texture.repeat.set(-sx, sy)
    texture.offset.set(sx + ox, oy)
  }, [size, videoRef])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const setup = () => {
      textureRef.current?.dispose()
      const texture = new THREE.VideoTexture(video)
      texture.colorSpace = THREE.SRGBColorSpace
      textureRef.current = texture
      applyAspect()
      scene.background = texture
    }

    if (video.readyState >= 2) {
      setup()
    } else {
      video.addEventListener('canplay', setup, { once: true })
    }

    return () => {
      textureRef.current?.dispose()
      textureRef.current = null
      scene.background = null
    }
  }, [scene, videoRef]) // no incluir applyAspect para no recrear la textura al cambiar tamaño

  // Re-aplicar aspect cada vez que cambia el tamaño del canvas o el video
  useEffect(() => {
    applyAspect()
  }, [applyAspect])

  return null
}
