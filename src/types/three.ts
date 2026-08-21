import type { Mesh } from 'three'
import type { RefObject } from 'react'

export type MeshRef = RefObject<Mesh | null>

export interface SpinningCubeProps {
  color?: string
  speed?: number
}
