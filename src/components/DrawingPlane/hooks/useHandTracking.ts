import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { RootState } from "@react-three/fiber";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { MP_THROTTLE_MS } from "../constants";
import type { HandSkeletonHandle, WorldPoint } from "../HandSkeleton";

interface UseHandTrackingParams {
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  size: RootState["size"];
  planeW: number;
  planeH: number;
  handLandmarkerRef: React.RefObject<HandLandmarker | null>;
  mpReadyRef: React.RefObject<boolean>;
  skeletonRef: React.RefObject<HandSkeletonHandle | null>;
}

export function useHandTracking({
  videoRef,
  size,
  planeW,
  planeH,
  handLandmarkerRef,
  mpReadyRef,
  skeletonRef,
}: UseHandTrackingParams) {
  const lastMpTimestamp = useRef(0);
  const lastResults = useRef<ReturnType<HandLandmarker["detectForVideo"]> | null>(null);
  const mpIntervalRef = useRef(100);

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

    type HandResults = ReturnType<HandLandmarker["detectForVideo"]>;
    let results: HandResults;
    if (now - lastMpTimestamp.current >= mpIntervalRef.current) {
      const t0 = performance.now();
      results = handLandmarker.detectForVideo(video, now);
      mpIntervalRef.current = Math.max(MP_THROTTLE_MS, (performance.now() - t0) * 1.2);
      lastMpTimestamp.current = now;
      lastResults.current = results;
    } else {
      results = lastResults.current ?? handLandmarker.detectForVideo(video, now);
    }

    const hands: WorldPoint[][] = results.landmarks.map((lm) =>
      lm.map((p) => ({ x: toWorldX(p.x), y: toWorldY(p.y) })),
    );

    const dotRadius = (6 / size.width) * planeW;
    skeletonRef.current?.update(hands, dotRadius);
  });
}
