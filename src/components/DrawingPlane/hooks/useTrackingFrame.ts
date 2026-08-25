import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { RootState } from "@react-three/fiber";
import * as THREE from "three";
import type { HandLandmarker, FaceLandmarker } from "@mediapipe/tasks-vision";
import { MP_THROTTLE_MS, PINCH_START, PINCH_STOP, PINCH_LOST_TOLERANCE, IS_DEV } from "../constants";
import type { Point, HandPinchState, HandFistState } from "../types";

interface UseTrackingFrameParams {
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  size: RootState["size"];
  planeW: number;
  planeH: number;
  offscreenCanvas: HTMLCanvasElement;
  handLandmarkerRef: React.RefObject<HandLandmarker | null>;
  faceLandmarkerRef: React.RefObject<FaceLandmarker | null>;
  mpReadyRef: React.RefObject<boolean>;
  isLockedRef: React.RefObject<boolean>;
  lockStateRef: React.RefObject<{
    noseNX: number;
    noseNY: number;
    angle: number;
    yaw: number;
    pitch: number;
  } | null>;
  dotMeshRefs: React.RefObject<THREE.Mesh | null>[];
  pinchMeshRef: React.RefObject<THREE.Mesh | null>;
  groupRef: React.RefObject<THREE.Group | null>;
  meshRef: React.RefObject<THREE.Mesh | null>;
  texture: THREE.CanvasTexture;
  textureDirty: React.RefObject<boolean>;
  drawDot: (x: number, y: number) => void;
  drawSegment: (fromMid: Point, control: Point, toMid: Point) => void;
  saveSnapshot: () => void;
  onPinchDebug?: (data: { label: string; dist: number; active: boolean }[]) => void;
}

export function useTrackingFrame({
  videoRef,
  size,
  planeW,
  planeH,
  offscreenCanvas,
  handLandmarkerRef,
  faceLandmarkerRef,
  mpReadyRef,
  isLockedRef,
  lockStateRef,
  dotMeshRefs,
  pinchMeshRef,
  groupRef,
  meshRef,
  texture,
  textureDirty,
  drawDot,
  drawSegment,
  saveSnapshot,
  onPinchDebug,
}: UseTrackingFrameParams) {
  const handPinchState = useRef(new Map<string, HandPinchState>());
  const handFistState = useRef(new Map<string, HandFistState>());

  const lastMpTimestamp = useRef(0);
  const lastHandResults = useRef<ReturnType<HandLandmarker["detectForVideo"]> | null>(null);
  const lastFaceMpTimestamp = useRef(0);
  const lastFaceResults = useRef<ReturnType<FaceLandmarker["detectForVideo"]> | null>(null);
  const mpIntervalRef = useRef(100);
  const faceIntervalRef = useRef(100);

  useFrame(() => {
    const video = videoRef?.current;
    const handLandmarker = handLandmarkerRef.current;
    if (!mpReadyRef.current || !video || !handLandmarker || video.readyState < 2) return;

    const now = performance.now();

    // Corrección de coordenadas para video con object-fit:cover.
    // MediaPipe devuelve coords en espacio del frame completo (0..1);
    // el video se muestra con crop centrado → compensar el crop.
    const va = (video.videoWidth || 1) / (video.videoHeight || 1);
    const ca = size.width / size.height;
    let cSx = 1, cSy = 1, cOx = 0, cOy = 0;
    if (va > ca) { cSx = ca / va; cOx = (1 - cSx) / 2; }
    else if (va < ca) { cSy = va / ca; cOy = (1 - cSy) / 2; }

    // video coords → Three.js world coords (con mirror + cover correction)
    const toWorldX = (px: number) => (0.5 - (px - cOx) / cSx) * planeW;
    const toWorldY = (py: number) => (0.5 - (py - cOy) / cSy) * planeH;
    // video coords → offscreen drawing canvas (px)
    const toCvX = (px: number) => (1 - (px - cOx) / cSx) * offscreenCanvas.width;
    const toCvY = (py: number) => ((py - cOy) / cSy) * offscreenCanvas.height;

    // Tamaño de los puntos en unidades de mundo
    const dotR = (8 / size.width) * planeW;
    const pinchR = (24 / size.width) * planeW;

    // Throttle de manos (adaptivo)
    type HandResults = ReturnType<HandLandmarker["detectForVideo"]>;
    let results: HandResults;
    if (isLockedRef.current) {
      handPinchState.current.clear();
      results = { landmarks: [], worldLandmarks: [], handedness: [], handednesses: [] } as unknown as HandResults;
    } else if (now - lastMpTimestamp.current >= mpIntervalRef.current) {
      const t0 = performance.now();
      results = handLandmarker.detectForVideo(video, now);
      mpIntervalRef.current = Math.max(MP_THROTTLE_MS, (performance.now() - t0) * 2);
      lastMpTimestamp.current = now;
      lastHandResults.current = results;
    } else {
      results = lastHandResults.current ?? handLandmarker.detectForVideo(video, now);
    }

    // ── Actualizar dots de landmarks (Three.js meshes) ────────────────────
    const numHands = Math.min(results.landmarks.length, 2);
    for (let h_i = 0; h_i < numHands; h_i++) {
      const lm = results.landmarks[h_i];
      for (let fi = 0; fi < 2; fi++) {
        const p = lm[[4, 8][fi]];
        const mesh = dotMeshRefs[h_i * 2 + fi].current;
        if (mesh) {
          mesh.position.set(toWorldX(p.x), toWorldY(p.y), 0.02);
          mesh.scale.setScalar(dotR);
          mesh.visible = true;
        }
      }
    }
    for (let i = numHands * 2; i < 4; i++) {
      const m = dotMeshRefs[i].current;
      if (m) m.visible = false;
    }

    if (pinchMeshRef.current) pinchMeshRef.current.visible = false;

    // ── Detección de pinch por mano ───────────────────────────────────────
    const detectedLabels = new Set<string>();
    for (const handedness of results.handedness) {
      detectedLabels.add(handedness[0].categoryName);
    }
    const pinchDbg: { label: string; dist: number; active: boolean }[] = [];

    for (let h_i = 0; h_i < results.landmarks.length; h_i++) {
      const lm = results.landmarks[h_i];
      const handLabel = results.handedness[h_i][0].categoryName;

      if (!handPinchState.current.has(handLabel)) {
        handPinchState.current.set(handLabel, {
          isPinchActive: false,
          lostFrames: 0,
          lastPos: null,
          lastMid: null,
          velocity: { x: 0, y: 0 },
        });
      }
      if (!handFistState.current.has(handLabel)) {
        handFistState.current.set(handLabel, { fistFrames: 0, fistCleared: false });
      }
      const ps = handPinchState.current.get(handLabel)!;

      const thumb = lm[4], index = lm[8];
      const wrist = lm[0], middleMCP = lm[9];
      const handScale = Math.sqrt(
        (wrist.x - middleMCP.x) ** 2 + (wrist.y - middleMCP.y) ** 2,
      );
      const rawDist = Math.sqrt(
        (thumb.x - index.x) ** 2 + (thumb.y - index.y) ** 2,
      );
      const dist = handScale > 0.001 ? rawDist / handScale : rawDist;

      // Posición del pinch en canvas de dibujo (con corrección cover)
      const pinchMx = (toCvX(thumb.x) + toCvX(index.x)) / 2;
      const pinchMy = (toCvY(thumb.y) + toCvY(index.y)) / 2;

      let activePinch = false;
      if (!ps.isPinchActive) {
        const otherHandDrawing = [...handPinchState.current.entries()].some(
          ([label, state]) => label !== handLabel && state.isPinchActive,
        );
        if (dist < PINCH_START && !otherHandDrawing) {
          saveSnapshot();
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

      // Dibujar con pinch
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
          const alpha = 0.5;
          ps.velocity = {
            x: alpha * (pinchMx - ps.lastPos.x) + (1 - alpha) * ps.velocity.x,
            y: alpha * (pinchMy - ps.lastPos.y) + (1 - alpha) * ps.velocity.y,
          };
        }
        ps.lastPos = { x: pinchMx, y: pinchMy };
      }

      // Extrapolación durante frames perdidos
      if (!activePinch && ps.isPinchActive && ps.lostFrames > 0 && ps.lastPos && ps.lastMid && !isLockedRef.current) {
        const DAMPING = 0.75;
        ps.velocity = { x: ps.velocity.x * DAMPING, y: ps.velocity.y * DAMPING };
        const extX = ps.lastPos.x + ps.velocity.x;
        const extY = ps.lastPos.y + ps.velocity.y;
        const newMid: Point = { x: (ps.lastPos.x + extX) / 2, y: (ps.lastPos.y + extY) / 2 };
        drawSegment(ps.lastMid, ps.lastPos, newMid);
        ps.lastMid = newMid;
        ps.lastPos = { x: extX, y: extY };
      }

      if (IS_DEV) pinchDbg.push({ label: handLabel, dist, active: activePinch });

      // Indicador de pinch: circle mesh en world space
      if (activePinch && pinchMeshRef.current) {
        pinchMeshRef.current.position.set(
          (toWorldX(thumb.x) + toWorldX(index.x)) / 2,
          (toWorldY(thumb.y) + toWorldY(index.y)) / 2,
          0.03,
        );
        pinchMeshRef.current.scale.setScalar(pinchR);
        pinchMeshRef.current.visible = true;
      }
    }

    if (IS_DEV) onPinchDebug?.(pinchDbg);

    // Decaimiento para manos/puños que dejaron de detectarse
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

    // ── Tracking de cara → transforms 3D ──────────────────────────────────
    const faceLandmarker = faceLandmarkerRef.current;
    if (faceLandmarker && isLockedRef.current) {
      type FaceResults = ReturnType<FaceLandmarker["detectForVideo"]>;
      let faceResults: FaceResults;
      if (now - lastFaceMpTimestamp.current >= faceIntervalRef.current) {
        const t0 = performance.now();
        faceResults = faceLandmarker.detectForVideo(video, now);
        faceIntervalRef.current = Math.max(MP_THROTTLE_MS, (performance.now() - t0) * 2);
        lastFaceMpTimestamp.current = now;
        lastFaceResults.current = faceResults;
      } else {
        faceResults = lastFaceResults.current ?? faceLandmarker.detectForVideo(video, now);
      }

      if (faceResults.faceLandmarks.length > 0) {
        const fl = faceResults.faceLandmarks[0];
        const nose = fl[4], chin = fl[152],
          leftCheek = fl[234], rightCheek = fl[454];

        // Roll: ángulo de la línea entre ojos exteriores (landmarks 33 y 263).
        const leftEyeOuter = fl[33];
        const rightEyeOuter = fl[263];
        const eyeDx = (1 - rightEyeOuter.x) - (1 - leftEyeOuter.x);
        const eyeDy = rightEyeOuter.y - leftEyeOuter.y;
        const angle = Math.atan2(eyeDy, eyeDx) * (180 / Math.PI);

        const noseNX = 1 - nose.x;
        const noseNY = nose.y;

        const cheekSpanX = Math.abs(1 - leftCheek.x - (1 - rightCheek.x));
        const yaw =
          Math.atan2(leftCheek.z - rightCheek.z, cheekSpanX + 0.001) *
          (180 / Math.PI);

        const noseToChinkY = Math.abs(chin.y - nose.y);
        const pitch =
          Math.atan2(nose.z - chin.z, noseToChinkY + 0.001) * (180 / Math.PI);

        if (!lockStateRef.current) {
          lockStateRef.current = { noseNX, noseNY, angle, yaw, pitch };
        }
        const { noseNX: nx0, noseNY: ny0, angle: a0, yaw: y0, pitch: p0 } =
          lockStateRef.current;

        const deltaRoll = -(angle - a0) * (Math.PI / 180);
        const deltaYaw = (yaw - y0) * (Math.PI / 180);
        const deltaPitch = -(pitch - p0) * (Math.PI / 180);

        const noseWorldX = (noseNX - 0.5) * planeW;
        const noseWorldY = (0.5 - noseNY) * planeH;
        const nose0WorldX = (nx0 - 0.5) * planeW;
        const nose0WorldY = (0.5 - ny0) * planeH;

        if (groupRef.current) {
          groupRef.current.position.set(noseWorldX, noseWorldY, 0);
          groupRef.current.rotation.set(deltaPitch, deltaYaw, deltaRoll);
        }
        if (meshRef.current) {
          meshRef.current.position.set(-nose0WorldX, -nose0WorldY, 0);
        }
      }
    }

    // Subir textura a GPU solo si el canvas cambió
    if (textureDirty.current) {
      texture.needsUpdate = true;
      textureDirty.current = false;
    }
  });
}
