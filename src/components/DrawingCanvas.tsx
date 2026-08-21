import {
  useRef,
  useEffect,
  useState,
  useCallback,
  memo,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  HandLandmarker,
  FaceLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";
import { BRUSH_SIZES, COLORS } from "../constants/drawing";
import type { BrushSize, DrawColor, DrawTool } from "../constants/drawing";

const PINCH_START = 0.035;
const PINCH_STOP = 0.1;
const PINCH_LOST_TOLERANCE = 3;

const FIST_FRAMES_THRESHOLD = 20; // ~333 ms a 60 fps
const FIST_FINGER_TIPS = [8, 12, 16, 20];
const FIST_FINGER_MCPS = [5, 9, 13, 17];

export interface DrawingCanvasHandle {
  clear: () => void;
  getCanvas: () => HTMLCanvasElement | null;
}

interface DrawingCanvasProps {
  brushSize: BrushSize;
  color: DrawColor;
  tool: DrawTool;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  isLocked?: boolean;
}

type MPStatus = "loading" | "ready" | "error";

type Point = { x: number; y: number };

const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(
  function DrawingCanvas(
    { brushSize, color, tool, videoRef, isLocked = false },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const landmarkCanvasRef = useRef<HTMLCanvasElement>(null);
    const drawCtxRef = useRef<CanvasRenderingContext2D | null>(null);

    const [mpStatus, setMpStatus] = useState<MPStatus>("loading");

    const brushSizeRef = useRef(brushSize);
    const colorRef = useRef(color);
    const toolRef = useRef(tool);
    const isLockedRef = useRef(isLocked);
    // Posición + ángulo de la nariz en el momento exacto de bloquear
    const lockStateRef = useRef<{ x: number; y: number; angle: number } | null>(null);
    useEffect(() => {
      brushSizeRef.current = brushSize;
    }, [brushSize]);
    useEffect(() => {
      colorRef.current = color;
    }, [color]);
    useEffect(() => {
      toolRef.current = tool;
    }, [tool]);
    useEffect(() => {
      isLockedRef.current = isLocked;
      if (!isLocked && canvasRef.current) {
        canvasRef.current.style.transform = "";
        canvasRef.current.style.transformOrigin = "";
        lockStateRef.current = null;
      }
    }, [isLocked]);

    // Pointer drawing state
    const isDrawing = useRef(false);
    const lastPos = useRef<Point | null>(null);
    const lastMid = useRef<Point | null>(null);

    // ── Canvas sizing (DPR-aware) ────────────────────────────────────────────────
    useEffect(() => {
      const resize = () => {
        const dpr = window.devicePixelRatio || 1;

        const c = canvasRef.current;
        if (c) {
          c.width = c.offsetWidth * dpr;
          c.height = c.offsetHeight * dpr;
          const ctx = c.getContext("2d");
          if (ctx) {
            ctx.scale(dpr, dpr);
            drawCtxRef.current = ctx;
          }
        }

        const lc = landmarkCanvasRef.current;
        if (lc) {
          lc.width = lc.offsetWidth * dpr;
          lc.height = lc.offsetHeight * dpr;
          const ctx = lc.getContext("2d");
          if (ctx) ctx.scale(dpr, dpr);
        }
      };
      resize();
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
    }, []);

    // ── Drawing helpers ──────────────────────────────────────────────────────────

    const applyTool = useCallback((ctx: CanvasRenderingContext2D) => {
      if (toolRef.current === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = "rgba(0,0,0,1)";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = COLORS[colorRef.current];
        ctx.strokeStyle = COLORS[colorRef.current];
      }
    }, []);

    const drawDot = useCallback(
      (ctx: CanvasRenderingContext2D, x: number, y: number) => {
        applyTool(ctx);
        ctx.beginPath();
        ctx.arc(x, y, BRUSH_SIZES[brushSizeRef.current] / 2, 0, Math.PI * 2);
        ctx.fill();
      },
      [applyTool],
    );

    const drawSegment = useCallback(
      (
        ctx: CanvasRenderingContext2D,
        fromMid: Point,
        control: Point,
        toMid: Point,
      ) => {
        applyTool(ctx);
        ctx.lineWidth = BRUSH_SIZES[brushSizeRef.current];
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(fromMid.x, fromMid.y);
        ctx.quadraticCurveTo(control.x, control.y, toMid.x, toMid.y);
        ctx.stroke();
      },
      [applyTool],
    );

    // ── Clear canvas ─────────────────────────────────────────────────────────────

    const clearCanvas = useCallback(() => {
      const ctx = drawCtxRef.current;
      const canvas = canvasRef.current;
      if (ctx && canvas) {
        ctx.globalCompositeOperation = "source-over";
        ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      }
    }, []);

    useImperativeHandle(
      ref,
      () => ({ clear: clearCanvas, getCanvas: () => canvasRef.current }),
      [clearCanvas],
    );

    // ── Pointer events (mouse + touch) ───────────────────────────────────────────

    const getPointerPos = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
      const rect = canvasRef.current!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!e.isPrimary) return;
      isDrawing.current = true;
      const pos = getPointerPos(e);
      lastPos.current = pos;
      lastMid.current = pos;
      const ctx = drawCtxRef.current;
      if (ctx) drawDot(ctx, pos.x, pos.y);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (
        !e.isPrimary ||
        !isDrawing.current ||
        !lastPos.current ||
        !lastMid.current
      )
        return;
      const ctx = drawCtxRef.current;
      if (!ctx) return;

      const pos = getPointerPos(e);
      const prev = lastPos.current;
      const newMid: Point = {
        x: (prev.x + pos.x) / 2,
        y: (prev.y + pos.y) / 2,
      };

      drawSegment(ctx, lastMid.current, prev, newMid);

      lastMid.current = newMid;
      lastPos.current = pos;
    };

    const stopPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!e.isPrimary) return;
      const ctx = drawCtxRef.current;
      if (ctx && isDrawing.current && lastMid.current && lastPos.current) {
        applyTool(ctx);
        ctx.lineWidth = BRUSH_SIZES[brushSizeRef.current];
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(lastMid.current.x, lastMid.current.y);
        ctx.lineTo(lastPos.current.x, lastPos.current.y);
        ctx.stroke();
      }
      isDrawing.current = false;
      lastPos.current = null;
      lastMid.current = null;
    };

    // ── Hand tracking ────────────────────────────────────────────────────────────

    useEffect(() => {
      // videoRef.current is null here — useWebcam's effect (in the parent App)
      // hasn't run yet because React fires child effects before parent effects.
      // We read videoRef.current inside tick() each frame instead, by which
      // point the parent effect has long since set it.
      if (!videoRef) return;

      let handLandmarker: HandLandmarker | null = null;
      let faceLandmarker: FaceLandmarker | null = null;
      let animId: number;
      type HandPinchState = {
        isPinchActive: boolean;
        lostFrames: number;
        lastPos: Point | null;
        lastMid: Point | null;
      };
      type HandFistState = { fistFrames: number; fistCleared: boolean };
      const handPinchState = new Map<string, HandPinchState>();
      const handFistState = new Map<string, HandFistState>();
      let clearFlashFrames = 0;
      let destroyed = false;

      const init = async () => {
        try {
          setMpStatus("loading");

          const withTimeout = <T,>(
            promise: Promise<T>,
            ms: number,
          ): Promise<T> => {
            const timeout = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms),
            );
            return Promise.race([promise, timeout]);
          };

          const vision = await withTimeout(
            FilesetResolver.forVisionTasks("/mediapipe"),
            15000,
          );
          if (destroyed) return;

          handLandmarker = await withTimeout(
            HandLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: "/models/hand_landmarker.task",
                delegate: "CPU",
              },
              runningMode: "VIDEO",
              numHands: 2,
            }),
            20000,
          );
          if (destroyed) {
            handLandmarker.close();
            return;
          }

          // Cara: opcional — si el modelo no está descargado se omite silenciosamente
          try {
            faceLandmarker = await withTimeout(
              FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                  modelAssetPath: "/models/face_landmarker.task",
                  delegate: "CPU",
                },
                runningMode: "VIDEO",
                numFaces: 1,
              }),
              20000,
            );
          } catch (e) {
            console.warn("FaceLandmarker no disponible:", e);
          }
          if (destroyed) {
            handLandmarker.close();
            faceLandmarker?.close();
            return;
          }

          setMpStatus("ready");

          const tick = () => {
            if (destroyed) return;
            animId = requestAnimationFrame(tick);

            const video = videoRef.current;
            const drawCanvas = canvasRef.current;
            const lmCanvas = landmarkCanvasRef.current;
            if (
              !video ||
              !drawCanvas ||
              !lmCanvas ||
              !handLandmarker ||
              video.readyState < 2
            )
              return;

            const timestamp = performance.now();
            const results = handLandmarker.detectForVideo(video, timestamp);

            const w = lmCanvas.offsetWidth;
            const h = lmCanvas.offsetHeight;
            const lmCtx = lmCanvas.getContext("2d")!;
            lmCtx.clearRect(0, 0, w, h);

            let rightIdx = -1;
            for (let i = 0; i < results.handedness.length; i++) {
              if (results.handedness[i][0].categoryName === "Right")
                rightIdx = i;
            }

            for (let h_i = 0; h_i < results.landmarks.length; h_i++) {
              const lm = results.landmarks[h_i];
              const isRight = h_i === rightIdx;
              const connColor = isRight
                ? "rgba(0,210,255,0.9)"
                : "rgba(255,210,0,0.9)";

              for (const { start, end } of HandLandmarker.HAND_CONNECTIONS) {
                const s = lm[start],
                  e = lm[end];
                lmCtx.strokeStyle = connColor;
                lmCtx.lineWidth = 2;
                lmCtx.beginPath();
                lmCtx.moveTo((1 - s.x) * w, s.y * h);
                lmCtx.lineTo((1 - e.x) * w, e.y * h);
                lmCtx.stroke();
              }
              for (let i = 0; i < lm.length; i++) {
                const p = lm[i];
                const isKey = i === 4 || i === 8;
                lmCtx.fillStyle = isKey ? "#ff4444" : "white";
                lmCtx.beginPath();
                lmCtx.arc(
                  (1 - p.x) * w,
                  p.y * h,
                  isKey ? 8 : 3,
                  0,
                  Math.PI * 2,
                );
                lmCtx.fill();
              }
            }

            // ── Per-hand pinch + fist detection ─────────────────────────────────
            const detectedLabels = new Set<string>();
            for (const handedness of results.handedness) {
              detectedLabels.add(handedness[0].categoryName);
            }

            for (let h_i = 0; h_i < results.landmarks.length; h_i++) {
              const lm = results.landmarks[h_i];
              const handLabel = results.handedness[h_i][0].categoryName;

              if (!handPinchState.has(handLabel)) {
                handPinchState.set(handLabel, {
                  isPinchActive: false,
                  lostFrames: 0,
                  lastPos: null,
                  lastMid: null,
                });
              }
              if (!handFistState.has(handLabel)) {
                handFistState.set(handLabel, {
                  fistFrames: 0,
                  fistCleared: false,
                });
              }
              const ps = handPinchState.get(handLabel)!;
              const fs = handFistState.get(handLabel)!;

              // Pinch detection
              const thumb = lm[4],
                index = lm[8];
              const thumbTip = { x: (1 - thumb.x) * w, y: thumb.y * h };
              const indexTip = { x: (1 - index.x) * w, y: index.y * h };
              const pinchMx = (thumbTip.x + indexTip.x) / 2;
              const pinchMy = (thumbTip.y + indexTip.y) / 2;
              const dist = Math.sqrt(
                (thumb.x - index.x) ** 2 + (thumb.y - index.y) ** 2,
              );

              let activePinch = false;
              if (!ps.isPinchActive) {
                if (dist < PINCH_START) {
                  ps.isPinchActive = true;
                  ps.lostFrames = 0;
                }
              } else {
                if (dist <= PINCH_STOP) {
                  ps.lostFrames = 0;
                  activePinch = true;
                } else {
                  ps.lostFrames++;
                  if (ps.lostFrames > PINCH_LOST_TOLERANCE) {
                    ps.isPinchActive = false;
                    ps.lostFrames = 0;
                    ps.lastPos = null;
                    ps.lastMid = null;
                  }
                }
              }

              // Draw if pinching (blocked when canvas is locked)
              if (activePinch && !isLockedRef.current) {
                const drawCtx = drawCtxRef.current;
                if (drawCtx) {
                  if (!ps.lastPos) {
                    drawDot(drawCtx, pinchMx, pinchMy);
                    ps.lastMid = { x: pinchMx, y: pinchMy };
                  } else if (ps.lastMid) {
                    const newMid: Point = {
                      x: (ps.lastPos.x + pinchMx) / 2,
                      y: (ps.lastPos.y + pinchMy) / 2,
                    };
                    drawSegment(drawCtx, ps.lastMid, ps.lastPos, newMid);
                    ps.lastMid = newMid;
                  }
                  ps.lastPos = { x: pinchMx, y: pinchMy };
                }
              }

              // Pinch visual indicator
              if (activePinch) {
                lmCtx.fillStyle = "rgba(0,255,120,0.4)";
                lmCtx.strokeStyle = "#00ff80";
                lmCtx.lineWidth = 3;
                lmCtx.beginPath();
                lmCtx.arc(pinchMx, pinchMy, 24, 0, Math.PI * 2);
                lmCtx.fill();
                lmCtx.stroke();
              } else if (!ps.isPinchActive) {
                lmCtx.strokeStyle = "rgba(255,100,100,0.7)";
                lmCtx.lineWidth = 2;
                lmCtx.setLineDash([4, 4]);
                lmCtx.beginPath();
                lmCtx.moveTo(thumbTip.x, thumbTip.y);
                lmCtx.lineTo(indexTip.x, indexTip.y);
                lmCtx.stroke();
                lmCtx.setLineDash([]);
              }

              // Fist detection (any hand → clear canvas)
              const isFist = FIST_FINGER_TIPS.every(
                (tip, i) => lm[tip].y > lm[FIST_FINGER_MCPS[i]].y,
              );

              if (isFist) {
                fs.fistFrames = Math.min(
                  fs.fistFrames + 1,
                  FIST_FRAMES_THRESHOLD,
                );
                if (fs.fistFrames >= FIST_FRAMES_THRESHOLD && !fs.fistCleared) {
                  clearCanvas();
                  fs.fistCleared = true;
                  clearFlashFrames = 40;
                }
              } else {
                fs.fistFrames = Math.max(fs.fistFrames - 2, 0);
                if (fs.fistFrames === 0) fs.fistCleared = false;
              }

              // Fist progress ring around palm
              if (fs.fistFrames > 0) {
                const palmLm = lm[9];
                const px = (1 - palmLm.x) * w;
                const py = palmLm.y * h;
                const progress = fs.fistFrames / FIST_FRAMES_THRESHOLD;
                lmCtx.fillStyle = `rgba(255,60,60,${0.15 + progress * 0.25})`;
                lmCtx.beginPath();
                lmCtx.arc(px, py, 44, 0, Math.PI * 2);
                lmCtx.fill();
                lmCtx.strokeStyle = fs.fistCleared
                  ? "#ff2222"
                  : "rgba(255,80,80,0.95)";
                lmCtx.lineWidth = 4;
                lmCtx.beginPath();
                lmCtx.arc(
                  px,
                  py,
                  44,
                  -Math.PI / 2,
                  -Math.PI / 2 + progress * Math.PI * 2,
                );
                lmCtx.stroke();
              }
            }

            // Decay state for hands no longer detected this frame
            for (const [label, ps] of handPinchState) {
              if (!detectedLabels.has(label) && ps.isPinchActive) {
                ps.lostFrames++;
                if (ps.lostFrames > PINCH_LOST_TOLERANCE) {
                  ps.isPinchActive = false;
                  ps.lostFrames = 0;
                  ps.lastPos = null;
                  ps.lastMid = null;
                }
              }
            }
            for (const [label, fs] of handFistState) {
              if (!detectedLabels.has(label)) {
                fs.fistFrames = Math.max(fs.fistFrames - 2, 0);
                if (fs.fistFrames === 0) fs.fistCleared = false;
              }
            }

            // ── Face landmarks (nariz + frente) + rotación al bloquear ──────────
            if (faceLandmarker) {
              const faceResults = faceLandmarker.detectForVideo(
                video,
                timestamp,
              );
              if (faceResults.faceLandmarks.length > 0) {
                const fl = faceResults.faceLandmarks[0];
                // Rotación del canvas de dibujo en eje Z cuando está bloqueado
                if (isLockedRef.current) {
                  const nose = fl[4], forehead = fl[9];
                  const dx = (1 - forehead.x) - (1 - nose.x);
                  const dy = forehead.y - nose.y;
                  const angle = Math.atan2(dx, -dy) * (180 / Math.PI);
                  const nx = (1 - nose.x) * w;
                  const ny = nose.y * h;

                  // Primer frame bloqueado: guardar referencia
                  if (!lockStateRef.current) {
                    lockStateRef.current = { x: nx, y: ny, angle };
                  }
                  const { x: nx0, y: ny0, angle: a0 } = lockStateRef.current;
                  const delta = angle - a0;

                  // translate(narizActual) · rotate(Δ) · translate(-narizInicial)
                  // → el punto de ancla original sigue a la nariz en pantalla
                  drawCanvas.style.transformOrigin = "0 0";
                  drawCanvas.style.transform =
                    `translate(${nx}px,${ny}px) rotate(${delta}deg) translate(${-nx0}px,${-ny0}px)`;
                }
              }
            }
            if (!isLockedRef.current) {
              drawCanvas.style.transform = "";
              drawCanvas.style.transformOrigin = "";
            }

            // Flash overlay after clearing
            if (clearFlashFrames > 0) {
              clearFlashFrames--;
              const alpha = clearFlashFrames / 40;
              lmCtx.fillStyle = `rgba(255,255,255,${alpha * 0.25})`;
              lmCtx.fillRect(0, 0, w, h);
              lmCtx.fillStyle = `rgba(255,255,255,${alpha})`;
              lmCtx.font = "bold 42px sans-serif";
              lmCtx.textAlign = "center";
              lmCtx.textBaseline = "middle";
              lmCtx.fillText("¡Borrado!", w / 2, h / 2);
            }
          };

          animId = requestAnimationFrame(tick);
        } catch (err) {
          console.error("MediaPipe init error:", err);
          setMpStatus("error");
        }
      };

      init();
      return () => {
        destroyed = true;
        cancelAnimationFrame(animId);
        handLandmarker?.close();
        faceLandmarker?.close();
      };
    }, [videoRef, drawDot, drawSegment, clearCanvas]);

    // ── Status badge ─────────────────────────────────────────────────────────────

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

    // ── Render ───────────────────────────────────────────────────────────────────

    return (
      <>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{
            cursor: isLocked ? "default" : "crosshair",
            touchAction: "none",
            pointerEvents: isLocked ? "none" : "auto",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopPointer}
          onPointerCancel={stopPointer}
          onPointerLeave={stopPointer}
        />
        <canvas
          ref={landmarkCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
        {videoRef && (
          <div
            className={`absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-sm font-medium select-none ${statusColor[mpStatus]}`}
          >
            {mpStatus === "loading" && (
              <span className="w-3 h-3 rounded-full bg-white/80 animate-pulse inline-block" />
            )}
            {mpStatus === "ready" && (
              <span className="w-3 h-3 rounded-full bg-white inline-block" />
            )}
            <span className="hidden">{statusLabel[mpStatus]}</span>
          </div>
        )}
      </>
    );
  },
);

export default memo(DrawingCanvas);
