import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { type Mesh } from 'three'
import type { SpinningCubeProps } from '../types/three'

export default function SpinningCube({ color = '#6366f1', speed = 1 }: SpinningCubeProps) {
  const meshRef = useRef<Mesh>(null)

  useFrame((_, delta) => {
    if (!meshRef.current) return
    meshRef.current.rotation.x += delta * speed * 0.5
    meshRef.current.rotation.y += delta * speed
  })

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color={color} roughness={0.3} metalness={0.4} />
    </mesh>
  )
}
