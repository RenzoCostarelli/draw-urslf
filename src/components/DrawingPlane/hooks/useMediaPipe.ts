import { useState, useRef, useCallback, useEffect } from "react";
import {
  HandLandmarker,
  FaceLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";
import type { MPStatus } from "../types";

interface UseMediaPipeParams {
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  onStatusChange?: (status: MPStatus) => void;
}

export function useMediaPipe({ videoRef, onStatusChange }: UseMediaPipeParams) {
  const [mpStatus, setMpStatus] = useState<MPStatus>("loading");
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const mpReadyRef = useRef(false);

  const updateStatus = useCallback(
    (s: MPStatus) => {
      setMpStatus(s);
      onStatusChange?.(s);
    },
    [onStatusChange],
  );

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
        updateStatus("loading");
        const vision = await withTimeout(
          FilesetResolver.forVisionTasks("/mediapipe"),
          15000,
        );
        if (destroyed) return;

        const createHand = (delegate: "GPU" | "CPU") =>
          HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: "/models/hand_landmarker.task", delegate },
            runningMode: "VIDEO",
            numHands: 2,
          });
        let hl: HandLandmarker;
        try {
          hl = await withTimeout(createHand("GPU"), 20000);
        } catch {
          hl = await withTimeout(createHand("CPU"), 20000);
        }
        if (destroyed) { hl.close(); return; }
        handLandmarkerRef.current = hl;

        try {
          const createFace = (delegate: "GPU" | "CPU") =>
            FaceLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath: "/models/face_landmarker.task", delegate },
              runningMode: "VIDEO",
              numFaces: 1,
            });
          let fl: FaceLandmarker;
          try {
            fl = await withTimeout(createFace("GPU"), 20000);
          } catch {
            fl = await withTimeout(createFace("CPU"), 20000);
          }
          if (!destroyed) faceLandmarkerRef.current = fl;
          else fl.close();
        } catch (e) {
          console.warn("FaceLandmarker no disponible:", e);
        }

        if (!destroyed) {
          mpReadyRef.current = true;
          updateStatus("ready");
        }
      } catch (err) {
        if (!destroyed) {
          console.error("MediaPipe init error:", err);
          updateStatus("error");
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
  }, [videoRef, updateStatus]);

  return { handLandmarkerRef, faceLandmarkerRef, mpReadyRef, mpStatus };
}
