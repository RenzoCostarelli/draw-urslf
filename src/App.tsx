import { useState, useRef, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import WebcamPlane from './components/WebcamPlane'
import DrawingCanvas from './components/DrawingCanvas'
import type { DrawingCanvasHandle } from './components/DrawingCanvas'
import Toolbar from './components/Toolbar'
import { useWebcam } from './hooks/useWebcam'
import type { BrushSize, DrawColor, DrawTool } from './constants/drawing'

const FFMPEG_CORE_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm'
const MAX_REC_SECS = 10

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function App() {
  const [brushSize, setBrushSize] = useState<BrushSize>('medium')
  const [color, setColor] = useState<DrawColor>('red')
  const [tool, setTool] = useState<DrawTool>('brush')
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscoding, setIsTranscoding] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)

  const videoRef = useWebcam()
  const drawingRef = useRef<DrawingCanvasHandle>(null)
  const threeContainerRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const animFrameRef = useRef<number>(0)
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const ffmpegRef = useRef<FFmpeg | null>(null)

  const loadFFmpeg = useCallback(async (): Promise<FFmpeg> => {
    if (ffmpegRef.current?.loaded) return ffmpegRef.current
    const ffmpeg = new FFmpeg()
    await ffmpeg.load({
      coreURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    ffmpegRef.current = ffmpeg
    return ffmpeg
  }, [])

  const handleCapture = useCallback(() => {
    const threeCanvas = threeContainerRef.current?.querySelector('canvas')
    const drawCanvas = drawingRef.current?.getCanvas()
    if (!threeCanvas || !drawCanvas) return

    // Use CSS dimensions × DPR capped at 2 (same as R3F) so both canvases
    // are scaled to the same output size regardless of their actual pixel dimensions.
    const cssW = threeCanvas.offsetWidth
    const cssH = threeCanvas.offsetHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const outW = cssW * dpr
    const outH = cssH * dpr

    const offscreen = document.createElement('canvas')
    offscreen.width = outW
    offscreen.height = outH
    const ctx = offscreen.getContext('2d')!
    ctx.drawImage(threeCanvas, 0, 0, outW, outH)
    ctx.drawImage(drawCanvas, 0, 0, outW, outH)

    const link = document.createElement('a')
    link.href = offscreen.toDataURL('image/png')
    link.download = `draw-${Date.now()}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [])

  const handleRecordToggle = useCallback(() => {
    if (isRecording) {
      // Manual stop
      if (autoStopRef.current) clearTimeout(autoStopRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
      mediaRecorderRef.current?.stop()
      cancelAnimationFrame(animFrameRef.current)
      setIsRecording(false)
      setRecordingSeconds(0)
      return
    }

    const threeCanvas = threeContainerRef.current?.querySelector('canvas')
    const drawCanvas = drawingRef.current?.getCanvas()
    if (!threeCanvas || !drawCanvas) return

    // Use CSS dimensions × DPR capped at 2 (same as R3F) so both canvases
    // always scale to the same output size, regardless of their actual pixel dimensions.
    const cssW = threeCanvas.offsetWidth
    const cssH = threeCanvas.offsetHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const outW = cssW * dpr
    const outH = cssH * dpr

    const offscreen = document.createElement('canvas')
    offscreen.width = outW
    offscreen.height = outH
    const ctx = offscreen.getContext('2d')!

    const tick = () => {
      ctx.clearRect(0, 0, outW, outH)
      ctx.drawImage(threeCanvas, 0, 0, outW, outH)
      ctx.drawImage(drawCanvas, 0, 0, outW, outH)
      animFrameRef.current = requestAnimationFrame(tick)
    }
    tick()

    const stream = offscreen.captureStream(30)
    const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')
      ? 'video/mp4;codecs=avc1'
      : MediaRecorder.isTypeSupported('video/mp4')
      ? 'video/mp4'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm'
    const recorder = new MediaRecorder(stream, { mimeType })
    const chunks: Blob[] = []

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

    const nativeMP4 = mimeType.startsWith('video/mp4')

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: mimeType })

      if (nativeMP4) {
        // Safari: ya es MP4, descargar directo
        downloadBlob(blob, `draw-${Date.now()}.mp4`)
        return
      }

      // Chrome/Firefox: transcodificar WebM → MP4 con ffmpeg
      setIsTranscoding(true)
      try {
        const ffmpeg = await loadFFmpeg()
        await ffmpeg.writeFile('input.webm', await fetchFile(blob))

        const exitCode = await ffmpeg.exec([
          '-i', 'input.webm',
          '-an',
          '-vf', 'scale=if(gt(iw,1280),1280,iw):-2',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '26',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          'output.mp4',
        ])

        if (exitCode !== 0) throw new Error(`ffmpeg error (code ${exitCode})`)

        const data = await ffmpeg.readFile('output.mp4') as Uint8Array
        await ffmpeg.deleteFile('input.webm')
        await ffmpeg.deleteFile('output.mp4')

        downloadBlob(new Blob([data.slice()], { type: 'video/mp4' }), `draw-${Date.now()}.mp4`)
      } catch (err) {
        console.error('[record] error al convertir a MP4:', err)
      } finally {
        setIsTranscoding(false)
      }
    }

    // Timeslice de 1 s para asegurar que los chunks lleguen
    recorder.start(1000)
    mediaRecorderRef.current = recorder
    setIsRecording(true)
    setRecordingSeconds(0)

    // Countdown
    countdownRef.current = setInterval(() => {
      setRecordingSeconds((prev) => prev + 1)
    }, 1000)

    // Auto-stop al llegar a MAX_REC_SECS
    autoStopRef.current = setTimeout(() => {
      if (countdownRef.current) clearInterval(countdownRef.current)
      mediaRecorderRef.current?.stop()
      cancelAnimationFrame(animFrameRef.current)
      setIsRecording(false)
      setRecordingSeconds(0)
    }, MAX_REC_SECS * 1000)
  }, [isRecording, loadFFmpeg])

  return (
    <div className="relative w-full h-full bg-neutral-900">
      {/* Webcam layer (Three.js background) */}
      <div ref={threeContainerRef} className="absolute inset-0">
        <Canvas
          camera={{ position: [0, 0, 6], fov: 60 }}
          className="w-full h-full"
          gl={{ preserveDrawingBuffer: true }}
        >
          <WebcamPlane videoRef={videoRef} />
        </Canvas>
      </div>

      {/* Drawing layer — transparent canvas above the webcam */}
      <DrawingCanvas ref={drawingRef} brushSize={brushSize} color={color} tool={tool} videoRef={videoRef} />

      {/* Toolbar UI */}
      <Toolbar
        brushSize={brushSize}
        color={color}
        tool={tool}
        isRecording={isRecording}
        isTranscoding={isTranscoding}
        recordingSeconds={recordingSeconds}
        maxRecordingSeconds={MAX_REC_SECS}
        onBrushSizeChange={setBrushSize}
        onColorChange={setColor}
        onToolChange={setTool}
        onClear={() => drawingRef.current?.clear()}
        onCapture={handleCapture}
        onRecordToggle={handleRecordToggle}
      />
    </div>
  )
}

export default App
