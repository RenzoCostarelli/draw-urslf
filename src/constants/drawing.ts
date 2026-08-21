export type BrushSize = 'small' | 'medium' | 'large'
export type DrawColor = 'red' | 'green' | 'yellow' | 'violet'
export type DrawTool = 'brush' | 'eraser'

export const BRUSH_SIZES: Record<BrushSize, number> = {
  small: 4,
  medium: 14,
  large: 32,
}

export const COLORS: Record<DrawColor, string> = {
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  violet: '#8b5cf6',
}
