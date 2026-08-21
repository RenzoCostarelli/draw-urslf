import { useState } from 'react'
import { COLORS } from '../constants/drawing'
import type { BrushSize, DrawColor, DrawTool } from '../constants/drawing'

interface ToolbarProps {
  brushSize: BrushSize
  color: DrawColor
  tool: DrawTool
  isRecording: boolean
  isTranscoding: boolean
  recordingSeconds: number
  maxRecordingSeconds: number
  onBrushSizeChange: (size: BrushSize) => void
  onColorChange: (color: DrawColor) => void
  onToolChange: (tool: DrawTool) => void
  onClear: () => void
  onCapture: () => void
  onRecordToggle: () => void
}

type Panel = 'brush' | 'eraser' | 'colors' | null

const BRUSH_CIRCLE_SIZES: Record<BrushSize, number> = {
  small: 8,
  medium: 18,
  large: 30,
}

const COLORS_LIST: DrawColor[] = ['red', 'green', 'yellow', 'violet']
const SIZES_LIST: BrushSize[] = ['small', 'medium', 'large']

const PANEL_CLASSES =
  'flex items-center gap-2 bg-black/60 backdrop-blur-md rounded-2xl px-4 py-3 select-none'

export default function Toolbar({
  brushSize,
  color,
  tool,
  isRecording,
  isTranscoding,
  recordingSeconds,
  maxRecordingSeconds,
  onBrushSizeChange,
  onColorChange,
  onToolChange,
  onClear,
  onCapture,
  onRecordToggle,
}: ToolbarProps) {
  const [panel, setPanel] = useState<Panel>(null)

  const toggle = (p: Exclude<Panel, null>) =>
    setPanel((prev) => (prev === p ? null : p))

  const handleBrush = () => {
    onToolChange('brush')
    toggle('brush')
  }

  const handleEraser = () => {
    onToolChange('eraser')
    toggle('eraser')
  }

  const handleClear = () => {
    onClear()
    setPanel(null)
  }

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
      {/* ── Panel flotante ──────────────────────────────── */}
      {panel && (
        <div className={PANEL_CLASSES}>
          {panel === 'colors' ? (
            COLORS_LIST.map((name) => (
              <button
                key={name}
                onClick={() => onColorChange(name)}
                className={`w-10 h-10 rounded-xl transition-all ${
                  color === name
                    ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-black'
                    : 'hover:scale-105'
                }`}
                style={{ backgroundColor: COLORS[name] }}
              />
            ))
          ) : (
            SIZES_LIST.map((size) => (
              <button
                key={size}
                onClick={() => onBrushSizeChange(size)}
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                  brushSize === size
                    ? 'bg-white/30 ring-2 ring-white'
                    : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                <div
                  style={{
                    width: BRUSH_CIRCLE_SIZES[size],
                    height: BRUSH_CIRCLE_SIZES[size],
                    backgroundColor: 'white',
                    borderRadius: '50%',
                    flexShrink: 0,
                  }}
                />
              </button>
            ))
          )}
        </div>
      )}

      {/* ── Barra principal ─────────────────────────────── */}
      <div className={PANEL_CLASSES}>
        {/* Pincel */}
        <button
          onClick={handleBrush}
          title="Pincel"
          className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
            tool === 'brush' ? 'bg-white/30 ring-2 ring-white' : 'bg-white/10 hover:bg-white/20'
          }`}
        >
          <svg viewBox="0 0 24 24" fill="white" width="22" height="22">
            <path d="M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37-1.34-1.34a1 1 0 0 0-1.41 0L9 12.25 11.75 15l8.96-8.96a1 1 0 0 0 0-1.41z" />
          </svg>
        </button>

        {/* Goma */}
        <button
          onClick={handleEraser}
          title="Goma de borrar"
          className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
            tool === 'eraser' ? 'bg-white/30 ring-2 ring-white' : 'bg-white/10 hover:bg-white/20'
          }`}
        >
          <svg viewBox="0 0 24 24" fill="white" width="22" height="22">
            <path d="M15.14 3c-.51 0-1.02.2-1.41.59L2.59 14.73c-.78.77-.78 2.03 0 2.81L5.9 20.82c.39.39.9.59 1.41.59H19c.55 0 1-.45 1-1s-.45-1-1-1h-3.59l3.29-3.29 1.59 1.59 1.41-1.41-1.59-1.59 1.48-1.48c.78-.77.78-2.03 0-2.81L16.55 3.59c-.39-.39-.9-.59-1.41-.59zm0 2 4.88 4.88-4.35 4.35L10.8 9.35 15.14 5z" />
          </svg>
        </button>

        {/* Colores */}
        <button
          onClick={() => toggle('colors')}
          title="Colores"
          className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
            panel === 'colors' ? 'ring-2 ring-white' : 'hover:brightness-110'
          }`}
          style={{ backgroundColor: COLORS[color] + 'bb' }}
        >
          <svg viewBox="0 0 24 24" fill="white" width="20" height="20">
            <path d="M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
          </svg>
        </button>

        {/* Captura foto */}
        <button
          onClick={onCapture}
          title="Tomar foto"
          className="w-12 h-12 rounded-xl flex items-center justify-center bg-white/10 hover:bg-white/20 transition-all"
        >
          <svg viewBox="0 0 24 24" fill="white" width="22" height="22">
            <path d="M12 15.2A3.2 3.2 0 1 1 12 8.8a3.2 3.2 0 0 1 0 6.4zm0-8.4A5.2 5.2 0 1 0 12 17.2 5.2 5.2 0 0 0 12 6.8zM9 3l-1.83 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2h-3.17L15 3H9z" />
          </svg>
        </button>

        {/* Grabar video */}
        <button
          onClick={onRecordToggle}
          disabled={isTranscoding}
          title={isTranscoding ? 'Convirtiendo a MP4…' : isRecording ? 'Detener grabación' : 'Grabar video'}
          className={`relative w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
            isTranscoding
              ? 'bg-yellow-500/50 ring-2 ring-yellow-400 cursor-not-allowed'
              : isRecording
              ? 'bg-red-500/70 ring-2 ring-red-400'
              : 'bg-white/10 hover:bg-white/20'
          }`}
        >
          {isTranscoding ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" width="22" height="22" className="animate-spin">
              <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
            </svg>
          ) : isRecording ? (
            <>
              {/* Countdown arc */}
              <svg viewBox="0 0 44 44" width="44" height="44" className="absolute inset-0">
                <circle
                  cx="22" cy="22" r="20"
                  fill="none" stroke="white" strokeWidth="3" strokeOpacity="0.3"
                />
                <circle
                  cx="22" cy="22" r="20"
                  fill="none" stroke="white" strokeWidth="3"
                  strokeDasharray={`${125.7 * (1 - recordingSeconds / maxRecordingSeconds)} 125.7`}
                  strokeLinecap="round"
                  transform="rotate(-90 22 22)"
                  style={{ transition: 'stroke-dasharray 0.9s linear' }}
                />
              </svg>
              <span className="text-white text-xs font-bold z-10">
                {maxRecordingSeconds - recordingSeconds}s
              </span>
            </>
          ) : (
            <svg viewBox="0 0 24 24" fill="white" width="22" height="22">
              <circle cx="12" cy="12" r="5" fill="#ef4444" />
              <circle cx="12" cy="12" r="9" fill="none" stroke="white" strokeWidth="1.5" />
            </svg>
          )}
        </button>

        {/* Bomba */}
        <button
          onClick={handleClear}
          title="Borrar todo"
          className="w-12 h-12 rounded-xl flex items-center justify-center bg-white/10 hover:bg-red-500/40 transition-all"
        >
          <svg viewBox="0 0 32 32" fill="white" width="26" height="26">
            <circle cx="13" cy="19" r="9" />
            <path d="M20 12 Q24 8 27 5" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <circle cx="27" cy="5" r="2.2" fill="#facc15" />
            <circle cx="10" cy="16" r="2.5" fill="rgba(255,255,255,0.25)" />
          </svg>
        </button>
      </div>
    </div>
  )
}
