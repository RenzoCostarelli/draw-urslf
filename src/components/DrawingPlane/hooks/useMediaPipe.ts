import { useState, useRef, useCallback, useEffect } from "react";
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import type { MPStatus } from "../types";

const MP_VERSION = "1.0.1";
const WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";

interface UseMediaPipeParams {
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  onStatusChange?: (status: MPStatus) => void;
}

export function useMediaPipe({ videoRef, onStatusChange }: UseMediaPipeParams) {
  const [mpStatus, setMpStatus] = useState<MPStatus>("loading");
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
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
          FilesetResolver.forVisionTasks(WASM_BASE_URL),
          15000,
        );
        if (destroyed) return;

        const createHand = (delegate: "GPU" | "CPU") =>
          HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate },
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

        mpReadyRef.current = true;
        updateStatus("ready");
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
    };
  }, [videoRef, updateStatus]);

  return { handLandmarkerRef, mpReadyRef, mpStatus };
}
