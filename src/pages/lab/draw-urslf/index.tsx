import { useState, useRef, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import WebcamPlane from '../../../components/WebcamPlane'
import DrawingCanvas from '../../../components/DrawingCanvas'
import type { DrawingCanvasHandle } from '../../../components/DrawingCanvas'
import Toolbar from '../../../components/Toolbar'
import { useWebcam } from '../../../hooks/useWebcam'
import type { BrushSize, DrawColor, DrawTool } from '../../../constants/drawing'

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

export default function DrawUrslf() {
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

    const cssW = threeCanvas.offsetWidth
    const cssH = threeCanvas.offsetHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const rawW = cssW * dpr
    const rawH = cssH * dpr
    // Cap at 1280px wide to keep JPEG under ~200 kb
    const maxW = 1280
    const scale = rawW > maxW ? maxW / rawW : 1
    const outW = Math.round(rawW * scale)
    const outH = Math.round(rawH * scale)

    const offscreen = document.createElement('canvas')
    offscreen.width = outW
    offscreen.height = outH
    const ctx = offscreen.getContext('2d')!
    ctx.drawImage(threeCanvas, 0, 0, outW, outH)
    ctx.drawImage(drawCanvas, 0, 0, outW, outH)

    offscreen.toBlob((blob) => {
      if (!blob) { console.error('[capture] toBlob returned null'); return }
      downloadBlob(blob, `draw-${Date.now()}.jpg`)
    }, 'image/jpeg', 0.82)
  }, [])

  const handleRecordToggle = useCallback(() => {
    if (isRecording) {
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
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 500_000 })
    const chunks: Blob[] = []

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

    const nativeMP4 = mimeType.startsWith('video/mp4')

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: mimeType })

      // Native MP4 (Chrome/Edge): the browser already applied the 500 kbps limit,
      // ffmpeg-wasm can't decode avc1 so we download directly.
      if (nativeMP4) {
        downloadBlob(blob, `draw-${Date.now()}.mp4`)
        return
      }

      setIsTranscoding(true)
      try {
        const ffmpeg = await loadFFmpeg()
        await ffmpeg.writeFile('input.webm', await fetchFile(blob))

        const exitCode = await ffmpeg.exec([
          '-i', 'input.webm',
          '-an',
          '-vf', 'scale=if(gt(iw,1280),1280,iw):-2',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '30',
          '-maxrate', '800k',
          '-bufsize', '1600k',
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

    recorder.start(1000)
    mediaRecorderRef.current = recorder
    setIsRecording(true)
    setRecordingSeconds(0)

    countdownRef.current = setInterval(() => {
      setRecordingSeconds((prev) => prev + 1)
    }, 1000)

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
      <div ref={threeContainerRef} className="absolute inset-0">
        <Canvas
          camera={{ position: [0, 0, 6], fov: 60 }}
          className="w-full h-full"
          gl={{ preserveDrawingBuffer: true }}
        >
          <WebcamPlane videoRef={videoRef} />
        </Canvas>
      </div>

      <DrawingCanvas ref={drawingRef} brushSize={brushSize} color={color} tool={tool} videoRef={videoRef} />

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
