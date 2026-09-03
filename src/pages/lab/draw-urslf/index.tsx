import { Canvas } from "@react-three/fiber";
import { Perf } from "r3f-perf";
import { useCallback, useRef, useState } from "react";
import type {
  DrawingCanvasHandle,
  MPStatus,
} from "../../../components/DrawingPlane";
import DrawingPlane from "../../../components/DrawingPlane";
import Toolbar from "../../../components/Toolbar";
import WebcamPlane from "../../../components/WebcamPlane";
import type {
  BrushSize,
  DrawColor,
  DrawTool,
} from "../../../constants/drawing";
import { useWebcam } from "../../../hooks/useWebcam";

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
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [mpStatus, setMpStatus] = useState<MPStatus>("loading");

  const [showFlash, setShowFlash] = useState(false);
  const [pinchDbg, setPinchDbg] = useState<
    { label: string; dist: number; active: boolean }[]
  >([]);

  const videoRef = useWebcam();
  const drawingRef = useRef<DrawingCanvasHandle>(null);
  const threeContainerRef = useRef<HTMLDivElement>(null);

  const handleHistoryChange = useCallback((u: boolean, r: boolean) => {
    setCanUndo(u);
    setCanRedo(r);
  }, []);

  return (
    <div className="relative w-full h-full bg-neutral-900 flex-1">
      <title>draw-urslf | *.lab /rnz0_</title>
      <meta
        name="description"
        content="Proyecto de investigación utilizando mediapipe para detección de gestos, rostro y manos."
      />
      <meta property="og:title" content="*.lab /rnz0_" />
      <meta
        property="og:description"
        content="Proyecto de investigación utilizando mediapipe para detección de gestos, rostro y manos."
      />
      <meta property="og:type" content="website" />
      {/* Three.js: webcam de fondo + plano de dibujo */}
      <div ref={threeContainerRef} className="absolute h-svh w-svw">
        <Canvas
          camera={{ position: [0, 0, 6], fov: 60 }}
          className="w-full h-full"
          style={{ touchAction: "none" }}
          dpr={[1, 2]}
          gl={{
            preserveDrawingBuffer: true,
            antialias: false,
            powerPreference: "high-performance",
          }}
        >
          {import.meta.env.DEV && <Perf position="top-right" />}

          <WebcamPlane videoRef={videoRef} />
          <DrawingPlane
            ref={drawingRef}
            brushSize={brushSize}
            color={color}
            tool={tool}
            videoRef={videoRef}
            isLocked={isLocked}
            onMpStatusChange={setMpStatus}
            onHistoryChange={handleHistoryChange}
            onClearFlash={() => {
              setShowFlash(true);
              setTimeout(() => setShowFlash(false), 900);
            }}
            onPinchDebug={import.meta.env.DEV ? setPinchDbg : undefined}
          />
        </Canvas>
      </div>

      {/* Flash de borrado */}
      {showFlash && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-white text-5xl font-bold drop-shadow-lg animate-fade-out select-none">
            ¡Borrado!
          </span>
        </div>
      )}

      {/* Panel debug de pinch (solo desarrollo) */}
      {import.meta.env.DEV && pinchDbg.length > 0 && (
        <div className="absolute top-3 left-3 bg-black/55 rounded px-3 py-2 text-xs font-mono text-white pointer-events-none select-none">
          {pinchDbg.map((d) => (
            <div
              key={d.label}
              style={{ color: d.active ? "#44ff88" : "white" }}
            >
              {d.label[0]}: {d.dist.toFixed(3)}
              {d.active ? " ●" : ""}
            </div>
          ))}
          <div className="text-white/45 mt-1">
            start&lt;{0.15} stop&lt;{0.18}
          </div>
        </div>
      )}

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
      <div className="fixed bottom-6 left-0 right-0 flex justify-center pointer-events-none">
        <div className="pointer-events-auto">
          <Toolbar
            brushSize={brushSize}
            color={color}
            tool={tool}
            onBrushSizeChange={setBrushSize}
            onColorChange={setColor}
            onToolChange={setTool}
            isLocked={isLocked}
            onClear={() => drawingRef.current?.clear()}
            onLockToggle={() => setIsLocked((l) => !l)}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={() => drawingRef.current?.undo()}
            onRedo={() => drawingRef.current?.redo()}
          />
        </div>
      </div>
    </div>
  );
}
