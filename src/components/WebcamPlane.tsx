import { useEffect, useRef, useCallback, useState } from 'react'
import { useThree, useStore } from '@react-three/fiber'
import * as THREE from 'three'

interface WebcamPlaneProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
}

export default function WebcamPlane({ videoRef }: WebcamPlaneProps) {
  const { size } = useThree()
  const store = useStore()
  const textureRef = useRef<THREE.VideoTexture | null>(null)
  // textureReady actúa como señal entre el effect de creación y el de aspect.
  // Es necesario para el caso asíncrono: cuando el video aún no está listo al
  // montar, el canplay crea la textura más tarde y hay que disparar applyAspect.
  const [textureReady, setTextureReady] = useState(false)

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
    // Acceder a scene imperativamenete desde el store evita capturar una
    // variable de render, que es lo que rechaza el React Compiler.
    const { scene } = store.getState()
    const video = videoRef.current
    if (!video) return

    const setup = () => {
      textureRef.current?.dispose()
      const texture = new THREE.VideoTexture(video)
      texture.colorSpace = THREE.SRGBColorSpace
      textureRef.current = texture
      scene.background = texture
      setTextureReady(true)
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
      setTextureReady(false)
    }
  }, [store, videoRef])

  // Re-aplicar aspect cuando la textura está lista o cuando cambia el tamaño del canvas.
  // textureReady en deps asegura que esto se ejecute también tras el caso asíncrono (canplay).
  useEffect(() => {
    if (textureReady) applyAspect()
  }, [applyAspect, textureReady])

  return null
}
