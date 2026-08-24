import { useState, useRef, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import WebcamPlane from "../../../components/WebcamPlane";
import DrawingPlane from "../../../components/DrawingPlane";
import type { DrawingCanvasHandle, MPStatus } from "../../../components/DrawingPlane";
import Toolbar from "../../../components/Toolbar";
import { useWebcam } from "../../../hooks/useWebcam";
import type {
  BrushSize,
  DrawColor,
  DrawTool,
} from "../../../constants/drawing";

const FFMPEG_CORE_BASE =
  "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm";
const MAX_REC_SECS = 10;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const statusLabel: Record<MPStatus, string> = {
  loading: "Cargando MediaPipe...",
  ready: "MediaPipe listo",
  error: "Error al cargar MediaPipe",
};
const statusColor: Record<MPStatus, string> = {
  loading: "bg-yellow-500/80",
  ready: "bg-green-500/80",
  error: "bg-red-500/80",
};

export default function DrawUrslf() {
  const [brushSize, setBrushSize] = useState<BrushSize>("medium");
  const [color, setColor] = useState<DrawColor>("red");
  const [tool, setTool] = useState<DrawTool>("brush");
  const [isLocked, setIsLocked] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscoding, setIsTranscoding] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [mpStatus, setMpStatus] = useState<MPStatus>("loading");

  const videoRef = useWebcam();
  const drawingRef = useRef<DrawingCanvasHandle>(null);
  const threeContainerRef = useRef<HTMLDivElement>(null);
  const landmarkCanvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  const loadFFmpeg = useCallback(async (): Promise<FFmpeg> => {
    if (ffmpegRef.current?.loaded) return ffmpegRef.current;
    const ffmpeg = new FFmpeg();
    await ffmpeg.load({
      coreURL: await toBlobURL(
        `${FFMPEG_CORE_BASE}/ffmpeg-core.js`,
        "text/javascript",
      ),
      wasmURL: await toBlobURL(
        `${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`,
        "application/wasm",
      ),
    });
    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  }, []);

  const handleRecordToggle = useCallback(() => {
    if (isRecording) {
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      setRecordingSeconds(0);
      return;
    }

    // El canvas WebGL ya contiene webcam + dibujo (todo en Three.js)
    const threeCanvas = threeContainerRef.current?.querySelector(
      "canvas",
    ) as HTMLCanvasElement | null;
    if (!threeCanvas) return;

    const stream = threeCanvas.captureStream(30);
    const mimeType = MediaRecorder.isTypeSupported("video/mp4;codecs=avc1")
      ? "video/mp4;codecs=avc1"
      : MediaRecorder.isTypeSupported("video/mp4")
        ? "video/mp4"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm";
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 500_000,
    });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const nativeMP4 = mimeType.startsWith("video/mp4");

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: mimeType });

      if (nativeMP4) {
        downloadBlob(blob, `draw-${Date.now()}.mp4`);
        return;
      }

      setIsTranscoding(true);
      try {
        const ffmpeg = await loadFFmpeg();
        await ffmpeg.writeFile("input.webm", await fetchFile(blob));

        const exitCode = await ffmpeg.exec([
          "-i", "input.webm",
          "-an",
          "-vf", "scale=if(gt(iw,1280),1280,iw):-2",
          "-c:v", "libx264",
          "-preset", "fast",
          "-crf", "30",
          "-maxrate", "800k",
          "-bufsize", "1600k",
          "-pix_fmt", "yuv420p",
          "-movflags", "+faststart",
          "output.mp4",
        ]);

        if (exitCode !== 0) throw new Error(`ffmpeg error (code ${exitCode})`);

        const data = (await ffmpeg.readFile("output.mp4")) as Uint8Array;
        await ffmpeg.deleteFile("input.webm");
        await ffmpeg.deleteFile("output.mp4");

        downloadBlob(
          new Blob([data.slice()], { type: "video/mp4" }),
          `draw-${Date.now()}.mp4`,
        );
      } catch (err) {
        console.error("[record] error al convertir a MP4:", err);
      } finally {
        setIsTranscoding(false);
      }
    };

    recorder.start(1000);
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
    setRecordingSeconds(0);

    countdownRef.current = setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);

    autoStopRef.current = setTimeout(() => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      setRecordingSeconds(0);
    }, MAX_REC_SECS * 1000);
  }, [isRecording, loadFFmpeg]);

  return (
    <div className="relative w-full h-full bg-neutral-900">
      {/* Three.js: webcam de fondo + plano de dibujo */}
      <div ref={threeContainerRef} className="absolute inset-0">
        <Canvas
          camera={{ position: [0, 0, 6], fov: 60 }}
          className="w-full h-full"
          gl={{ preserveDrawingBuffer: true }}
        >
          <WebcamPlane videoRef={videoRef} />
          <DrawingPlane
            ref={drawingRef}
            brushSize={brushSize}
            color={color}
            tool={tool}
            videoRef={videoRef}
            isLocked={isLocked}
            landmarkCanvasRef={landmarkCanvasRef}
            onMpStatusChange={setMpStatus}
          />
        </Canvas>
      </div>

      {/* Overlay DOM: canvas de landmarks de manos/cara */}
      <canvas
        ref={landmarkCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Badge de estado MediaPipe */}
      {videoRef && (
        <div className="absolute top-4 left-4 flex items-center gap-2">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-sm font-medium select-none ${statusColor[mpStatus]}`}
          >
            {mpStatus === "loading" && (
              <span className="w-3 h-3 rounded-full bg-white/80 animate-pulse inline-block" />
            )}
            {mpStatus === "ready" && (
              <span className="w-3 h-3 rounded-full bg-white inline-block" />
            )}
            <span className="hidden">{statusLabel[mpStatus]}</span>
          </div>
        </div>
      )}

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
        isLocked={isLocked}
        onClear={() => drawingRef.current?.clear()}
        onRecordToggle={handleRecordToggle}
        onLockToggle={() => setIsLocked((l) => !l)}
      />
    </div>
  );
}
