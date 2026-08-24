import {
  useRef,
  useEffect,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useMemo,
  memo,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  HandLandmarker,
  FaceLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";
import { BRUSH_SIZES, COLORS } from "../constants/drawing";
import type { BrushSize, DrawColor, DrawTool } from "../constants/drawing";

const PINCH_START = 0.035;
const PINCH_STOP = 0.04;
const PINCH_LOST_TOLERANCE = 1;
// Resolución del canvas de dibujo (independiente de la pantalla)
const CANVAS_W = 2048;
const CANVAS_H = 1152;

export interface DrawingCanvasHandle {
  clear: () => void;
  getCanvas: () => HTMLCanvasElement | null;
}

export type MPStatus = "loading" | "ready" | "error";

interface DrawingPlaneProps {
  brushSize: BrushSize;
  color: DrawColor;
  tool: DrawTool;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  isLocked?: boolean;
  landmarkCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
  onMpStatusChange?: (status: MPStatus) => void;
}

type Point = { x: number; y: number };
type HandPinchState = {
  isPinchActive: boolean;
  lostFrames: number;
  lastPos: Point | null;
  lastMid: Point | null;
};
type HandFistState = { fistFrames: number; fistCleared: boolean };

const DrawingPlane = forwardRef<DrawingCanvasHandle, DrawingPlaneProps>(
  function DrawingPlane(
    {
      brushSize,
      color,
      tool,
      videoRef,
      isLocked = false,
      landmarkCanvasRef,
      onMpStatusChange,
    },
    ref,
  ) {
    const { camera, size, gl } = useThree();

    // ── Dimensiones del plano (llenar el viewport exactamente) ────────────────
    // Con FOV=60 y cámara en z=6, el plano en z=0 cubre la pantalla completa
    const planeH = useMemo(() => {
      const fovRad =
        ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180;
      return 2 * Math.tan(fovRad / 2) * Math.abs(camera.position.z);
    }, [camera]);
    const planeW = useMemo(
      () => planeH * (size.width / size.height),
      [planeH, size],
    );

    // ── Canvas 2D offscreen + CanvasTexture ───────────────────────────────────
    const offscreenCanvas = useMemo(() => {
      const c = document.createElement("canvas");
      c.width = CANVAS_W;
      c.height = CANVAS_H;
      return c;
    }, []);
    const draw2dCtx = useMemo(
      () => offscreenCanvas.getContext("2d")!,
      [offscreenCanvas],
    );
    const texture = useMemo(
      () => new THREE.CanvasTexture(offscreenCanvas),
      [offscreenCanvas],
    );
    useEffect(() => () => texture.dispose(), [texture]);

    // Solo subir la textura a GPU cuando el canvas haya cambiado
    const textureDirty = useRef(false);

    // ── Refs de escena ────────────────────────────────────────────────────────
    const groupRef = useRef<THREE.Group>(null); // pivote de rotación (nariz)
    const meshRef = useRef<THREE.Mesh>(null);   // plano de dibujo

    // ── Sincronización de props via refs (sin re-renders) ─────────────────────
    const brushSizeRef = useRef(brushSize);
    const colorRef = useRef(color);
    const toolRef = useRef(tool);
    const isLockedRef = useRef(isLocked);
    const lockStateRef = useRef<{
      noseNX: number;
      noseNY: number;
      angle: number;
      yaw: number;
      pitch: number;
    } | null>(null);

    useEffect(() => { brushSizeRef.current = brushSize; }, [brushSize]);
    useEffect(() => { colorRef.current = color; }, [color]);
    useEffect(() => { toolRef.current = tool; }, [tool]);
    useEffect(() => {
      isLockedRef.current = isLocked;
      if (!isLocked) {
        lockStateRef.current = null;
        if (groupRef.current && meshRef.current) {
          groupRef.current.position.set(0, 0, 0);
          groupRef.current.rotation.set(0, 0, 0);
          meshRef.current.position.set(0, 0, 0);
        }
      }
    }, [isLocked]);

    // Cursor del canvas WebGL
    useEffect(() => {
      gl.domElement.style.cursor = isLocked ? "default" : "crosshair";
    }, [isLocked, gl]);

    // ── Sizing del canvas de landmarks ────────────────────────────────────────
    // El <canvas> DOM tiene 300×150 por defecto; hay que ajustarlo al viewport
    useEffect(() => {
      const lmCanvas = landmarkCanvasRef?.current;
      if (!lmCanvas) return;

      const resize = () => {
        const dpr = window.devicePixelRatio || 1;
        lmCanvas.width = lmCanvas.offsetWidth * dpr;
        lmCanvas.height = lmCanvas.offsetHeight * dpr;
        const ctx = lmCanvas.getContext("2d");
        if (ctx) ctx.scale(dpr, dpr);
      };
      resize();
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
    }, [landmarkCanvasRef]);

    // ── Estado de MediaPipe ───────────────────────────────────────────────────
    const [mpStatus, setMpStatus] = useState<MPStatus>("loading");
    const handLandmarkerRef = useRef<HandLandmarker | null>(null);
    const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
    const mpReadyRef = useRef(false);

    const updateMpStatus = useCallback(
      (s: MPStatus) => {
        setMpStatus(s);
        onMpStatusChange?.(s);
      },
      [onMpStatusChange],
    );

    // ── Inicialización de MediaPipe ───────────────────────────────────────────
    useEffect(() => {
      if (!videoRef) return;
      let destroyed = false;

      const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> => {
        const t = new Promise<never>((_, r) =>
          setTimeout(() => r(new Error(`Timeout ${ms}ms`)), ms),
        );
        return Promise.race([p, t]);
      };

      const init = async () => {
        try {
          updateMpStatus("loading");
          const vision = await withTimeout(
            FilesetResolver.forVisionTasks("/mediapipe"),
            15000,
          );
          if (destroyed) return;

          const hl = await withTimeout(
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
          if (destroyed) { hl.close(); return; }
          handLandmarkerRef.current = hl;

          try {
            const fl = await withTimeout(
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
            if (!destroyed) faceLandmarkerRef.current = fl;
            else fl.close();
          } catch (e) {
            console.warn("FaceLandmarker no disponible:", e);
          }

          if (!destroyed) {
            mpReadyRef.current = true;
            updateMpStatus("ready");
          }
        } catch (err) {
          if (!destroyed) {
            console.error("MediaPipe init error:", err);
            updateMpStatus("error");
          }
        }
      };

      init();
      return () => {
        destroyed = true;
        mpReadyRef.current = false;
        handLandmarkerRef.current?.close();
        handLandmarkerRef.current = null;
        faceLandmarkerRef.current?.close();
        faceLandmarkerRef.current = null;
      };
    }, [videoRef, updateMpStatus]);

    // ── Helpers de dibujo ─────────────────────────────────────────────────────
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
      (x: number, y: number) => {
        applyTool(draw2dCtx);
        draw2dCtx.beginPath();
        draw2dCtx.arc(x, y, BRUSH_SIZES[brushSizeRef.current] / 2, 0, Math.PI * 2);
        draw2dCtx.fill();
        textureDirty.current = true;
      },
      [applyTool, draw2dCtx],
    );

    const drawSegment = useCallback(
      (fromMid: Point, control: Point, toMid: Point) => {
        applyTool(draw2dCtx);
        draw2dCtx.lineWidth = BRUSH_SIZES[brushSizeRef.current];
        draw2dCtx.lineCap = "round";
        draw2dCtx.lineJoin = "round";
        draw2dCtx.beginPath();
        draw2dCtx.moveTo(fromMid.x, fromMid.y);
        draw2dCtx.quadraticCurveTo(control.x, control.y, toMid.x, toMid.y);
        draw2dCtx.stroke();
        textureDirty.current = true;
      },
      [applyTool, draw2dCtx],
    );

    const clearCanvas = useCallback(() => {
      draw2dCtx.globalCompositeOperation = "source-over";
      draw2dCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      textureDirty.current = true;
    }, [draw2dCtx]);

    useImperativeHandle(
      ref,
      () => ({ clear: clearCanvas, getCanvas: () => offscreenCanvas }),
      [clearCanvas, offscreenCanvas],
    );

    // ── Dibujo con puntero (eventos R3F → coordenadas UV → canvas) ────────────
    const isDrawing = useRef(false);
    const lastPos = useRef<Point | null>(null);
    const lastMid = useRef<Point | null>(null);

    const uvToCanvas = (uv: THREE.Vector2): Point => ({
      x: uv.x * CANVAS_W,
      y: (1 - uv.y) * CANVAS_H, // UV V=1 es arriba, canvas Y=0 es arriba
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlePointerDown = useCallback((e: any) => {
      if (isLockedRef.current || !e.uv) return;
      e.stopPropagation();
      isDrawing.current = true;
      const pos = uvToCanvas(e.uv);
      lastPos.current = pos;
      lastMid.current = pos;
      drawDot(pos.x, pos.y);
    }, [drawDot]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlePointerMove = useCallback((e: any) => {
      if (
        isLockedRef.current ||
        !isDrawing.current ||
        !e.uv ||
        !lastPos.current ||
        !lastMid.current
      )
        return;
      e.stopPropagation();
      const pos = uvToCanvas(e.uv);
      const prev = lastPos.current;
      const newMid: Point = {
        x: (prev.x + pos.x) / 2,
        y: (prev.y + pos.y) / 2,
      };
      drawSegment(lastMid.current, prev, newMid);
      lastMid.current = newMid;
      lastPos.current = pos;
    }, [drawSegment]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stopPointer = useCallback((_e: any) => {
      if (isLockedRef.current) return;
      if (isDrawing.current && lastMid.current && lastPos.current) {
        applyTool(draw2dCtx);
        draw2dCtx.lineWidth = BRUSH_SIZES[brushSizeRef.current];
        draw2dCtx.lineCap = "round";
        draw2dCtx.beginPath();
        draw2dCtx.moveTo(lastMid.current.x, lastMid.current.y);
        draw2dCtx.lineTo(lastPos.current.x, lastPos.current.y);
        draw2dCtx.stroke();
        textureDirty.current = true;
      }
      isDrawing.current = false;
      lastPos.current = null;
      lastMid.current = null;
    }, [applyTool, draw2dCtx]);

    // Estado persistente de pinch/fist entre frames
    const handPinchState = useRef(new Map<string, HandPinchState>());
    const handFistState = useRef(new Map<string, HandFistState>());
    const clearFlashFrames = useRef(0);

    // ── useFrame: detección MediaPipe + transform del mesh ────────────────────
    useFrame(() => {
      const video = videoRef?.current;
      const handLandmarker = handLandmarkerRef.current;
      if (!mpReadyRef.current || !video || !handLandmarker || video.readyState < 2)
        return;

      const lmCanvas = landmarkCanvasRef?.current;
      const lmW = lmCanvas?.offsetWidth ?? size.width;
      const lmH = lmCanvas?.offsetHeight ?? size.height;
      const lmCtx = lmCanvas?.getContext("2d") ?? null;
      if (lmCtx) lmCtx.clearRect(0, 0, lmW, lmH);

      const timestamp = performance.now();
      const results = handLandmarker.detectForVideo(video, timestamp);

      // ── Visualización de landmarks de manos ────────────────────────────────
      let rightIdx = -1;
      for (let i = 0; i < results.handedness.length; i++) {
        if (results.handedness[i][0].categoryName === "Right") rightIdx = i;
      }
      for (let h_i = 0; h_i < results.landmarks.length; h_i++) {
        const lm = results.landmarks[h_i];
        const isRight = h_i === rightIdx;
        if (lmCtx) {
          const connColor = isRight
            ? "rgba(0,210,255,0.9)"
            : "rgba(255,210,0,0.9)";
          for (const { start, end } of HandLandmarker.HAND_CONNECTIONS) {
            const s = lm[start], e = lm[end];
            lmCtx.strokeStyle = connColor;
            lmCtx.lineWidth = 2;
            lmCtx.beginPath();
            lmCtx.moveTo((1 - s.x) * lmW, s.y * lmH);
            lmCtx.lineTo((1 - e.x) * lmW, e.y * lmH);
            lmCtx.stroke();
          }
          for (let i = 0; i < lm.length; i++) {
            const p = lm[i];
            const isKey = i === 4 || i === 8;
            lmCtx.fillStyle = isKey ? "#ff4444" : "white";
            lmCtx.beginPath();
            lmCtx.arc(
              (1 - p.x) * lmW,
              p.y * lmH,
              isKey ? 8 : 3,
              0,
              Math.PI * 2,
            );
            lmCtx.fill();
          }
        }
      }

      // ── Detección de pinch por mano ────────────────────────────────────────
      const detectedLabels = new Set<string>();
      for (const handedness of results.handedness) {
        detectedLabels.add(handedness[0].categoryName);
      }

      for (let h_i = 0; h_i < results.landmarks.length; h_i++) {
        const lm = results.landmarks[h_i];
        const handLabel = results.handedness[h_i][0].categoryName;

        if (!handPinchState.current.has(handLabel)) {
          handPinchState.current.set(handLabel, {
            isPinchActive: false,
            lostFrames: 0,
            lastPos: null,
            lastMid: null,
          });
        }
        if (!handFistState.current.has(handLabel)) {
          handFistState.current.set(handLabel, {
            fistFrames: 0,
            fistCleared: false,
          });
        }
        const ps = handPinchState.current.get(handLabel)!;

        const thumb = lm[4], index = lm[8];
        const dist = Math.sqrt(
          (thumb.x - index.x) ** 2 + (thumb.y - index.y) ** 2,
        );

        // Posición del pinch en coordenadas del canvas de dibujo
        const pinchMx = ((1 - thumb.x + 1 - index.x) / 2) * CANVAS_W;
        const pinchMy = ((thumb.y + index.y) / 2) * CANVAS_H;

        let activePinch = false;
        if (!ps.isPinchActive) {
          const otherHandDrawing = [...handPinchState.current.entries()].some(
            ([label, state]) => label !== handLabel && state.isPinchActive,
          );
          if (dist < PINCH_START && !otherHandDrawing) {
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

        // Dibujar con pinch (bloqueado cuando isLocked)
        if (activePinch && !isLockedRef.current) {
          if (!ps.lastPos) {
            drawDot(pinchMx, pinchMy);
            ps.lastMid = { x: pinchMx, y: pinchMy };
          } else if (ps.lastMid) {
            const newMid: Point = {
              x: (ps.lastPos.x + pinchMx) / 2,
              y: (ps.lastPos.y + pinchMy) / 2,
            };
            drawSegment(ps.lastMid, ps.lastPos, newMid);
            ps.lastMid = newMid;
          }
          ps.lastPos = { x: pinchMx, y: pinchMy };
        }

        // Indicador visual del pinch (en coordenadas de pantalla)
        if (lmCtx) {
          const pinchScreenMx = ((1 - thumb.x + 1 - index.x) / 2) * lmW;
          const pinchScreenMy = ((thumb.y + index.y) / 2) * lmH;
          const thumbScreenX = (1 - thumb.x) * lmW;
          const thumbScreenY = thumb.y * lmH;
          const indexScreenX = (1 - index.x) * lmW;
          const indexScreenY = index.y * lmH;

          if (activePinch) {
            lmCtx.fillStyle = "rgba(0,255,120,0.4)";
            lmCtx.strokeStyle = "#00ff80";
            lmCtx.lineWidth = 3;
            lmCtx.beginPath();
            lmCtx.arc(pinchScreenMx, pinchScreenMy, 24, 0, Math.PI * 2);
            lmCtx.fill();
            lmCtx.stroke();
          } else if (!ps.isPinchActive) {
            lmCtx.strokeStyle = "rgba(255,100,100,0.7)";
            lmCtx.lineWidth = 2;
            lmCtx.setLineDash([4, 4]);
            lmCtx.beginPath();
            lmCtx.moveTo(thumbScreenX, thumbScreenY);
            lmCtx.lineTo(indexScreenX, indexScreenY);
            lmCtx.stroke();
            lmCtx.setLineDash([]);
          }
        }
      }

      // Decaimiento para manos que dejaron de detectarse
      for (const [label, ps] of handPinchState.current) {
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
      for (const [label, fs] of handFistState.current) {
        if (!detectedLabels.has(label)) {
          fs.fistFrames = Math.max(fs.fistFrames - 2, 0);
          if (fs.fistFrames === 0) fs.fistCleared = false;
        }
      }

      // ── Tracking de cara → transforms 3D del mesh ─────────────────────────
      const faceLandmarker = faceLandmarkerRef.current;
      if (faceLandmarker && isLockedRef.current) {
        const faceResults = faceLandmarker.detectForVideo(video, timestamp);
        if (faceResults.faceLandmarks.length > 0) {
          const fl = faceResults.faceLandmarks[0];
          const nose = fl[4],
            forehead = fl[9],
            chin = fl[152],
            leftCheek = fl[234],
            rightCheek = fl[454];

          // Roll (eje Z)
          const fdx = 1 - forehead.x - (1 - nose.x);
          const fdy = forehead.y - nose.y;
          const angle = Math.atan2(fdx, -fdy) * (180 / Math.PI);

          // Nariz en coords normalizadas [0..1], espejada en X
          const noseNX = 1 - nose.x;
          const noseNY = nose.y;

          // Yaw (eje Y): diferencia de profundidad Z entre mejillas
          const cheekSpanX = Math.abs(
            (1 - leftCheek.x) - (1 - rightCheek.x),
          );
          const yaw =
            Math.atan2(leftCheek.z - rightCheek.z, cheekSpanX + 0.001) *
            (180 / Math.PI);

          // Pitch (eje X): diferencia de profundidad Z entre nariz y barbilla
          const noseToChinkY = Math.abs(chin.y - nose.y);
          const pitch =
            Math.atan2(nose.z - chin.z, noseToChinkY + 0.001) *
            (180 / Math.PI);

          // Primer frame bloqueado: guardar referencia
          if (!lockStateRef.current) {
            lockStateRef.current = { noseNX, noseNY, angle, yaw, pitch };
          }
          const {
            noseNX: nx0,
            noseNY: ny0,
            angle: a0,
            yaw: y0,
            pitch: p0,
          } = lockStateRef.current;

          const deltaRoll = (angle - a0) * (Math.PI / 180);
          const deltaYaw = (yaw - y0) * (Math.PI / 180);
          const deltaPitch = (pitch - p0) * (Math.PI / 180);

          // Convertir coords normalizadas → espacio mundo Three.js
          // Normalizado (0..1) → x: [-planeW/2, planeW/2], y: [planeH/2, -planeH/2]
          const noseWorldX = (noseNX - 0.5) * planeW;
          const noseWorldY = (0.5 - noseNY) * planeH;
          const nose0WorldX = (nx0 - 0.5) * planeW;
          const nose0WorldY = (0.5 - ny0) * planeH;

          // El grupo pivota en la posición actual de la nariz
          if (groupRef.current) {
            groupRef.current.position.set(noseWorldX, noseWorldY, 0);
            groupRef.current.rotation.set(deltaPitch, deltaYaw, deltaRoll);
          }
          // El mesh se desplaza dentro del grupo para anular la posición inicial de la nariz
          // → el punto de anclaje original se mantiene sobre la nariz actual
          if (meshRef.current) {
            meshRef.current.position.set(-nose0WorldX, -nose0WorldY, 0);
          }
        }
      }

      // ── Flash de borrado ───────────────────────────────────────────────────
      if (clearFlashFrames.current > 0 && lmCtx) {
        clearFlashFrames.current--;
        const alpha = clearFlashFrames.current / 40;
        lmCtx.fillStyle = `rgba(255,255,255,${alpha * 0.25})`;
        lmCtx.fillRect(0, 0, lmW, lmH);
        lmCtx.fillStyle = `rgba(255,255,255,${alpha})`;
        lmCtx.font = "bold 42px sans-serif";
        lmCtx.textAlign = "center";
        lmCtx.textBaseline = "middle";
        lmCtx.fillText("¡Borrado!", lmW / 2, lmH / 2);
      }

      // Subir textura a GPU solo si el canvas cambió
      if (textureDirty.current) {
        texture.needsUpdate = true;
        textureDirty.current = false;
      }
    });

    // Suprimir advertencia de mpStatus no usado (se propaga via onMpStatusChange)
    void mpStatus;

    return (
      <group ref={groupRef}>
        <mesh
          ref={meshRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopPointer}
          onPointerLeave={stopPointer}
          onPointerCancel={stopPointer}
        >
          <planeGeometry args={[planeW, planeH]} />
          <meshBasicMaterial
            map={texture}
            transparent
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      </group>
    );
  },
);

export default memo(DrawingPlane);
