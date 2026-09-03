import {
  useRef,
  useEffect,
  useMemo,
  forwardRef,
  useImperativeHandle,
  memo,
} from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useDrawingCanvas } from "./hooks/useDrawingCanvas";
import { useDrawingHistory } from "./hooks/useDrawingHistory";
import { usePointerHandlers } from "./hooks/usePointerHandlers";
import { useMediaPipe } from "./hooks/useMediaPipe";
import { useHandTracking } from "./hooks/useHandTracking";
import { useDevOverlay } from "./hooks/useDevOverlay";
import HandSkeleton from "./HandSkeleton";
import type { HandSkeletonHandle } from "./HandSkeleton";
import type { DrawingCanvasHandle, DrawingPlaneProps } from "./types";
import type { BrushSize, DrawColor, DrawTool } from "../../constants/drawing";

export type { DrawingCanvasHandle, MPStatus } from "./types";

const DrawingPlane = forwardRef<DrawingCanvasHandle, DrawingPlaneProps>(
  function DrawingPlane(
    {
      brushSize,
      color,
      tool,
      videoRef,
      isLocked = false,
      onMpStatusChange,
      onHistoryChange,
      onClearFlash,
    },
    ref,
  ) {
    const { camera, size, gl } = useThree();

    // ── Dimensiones del plano ─────────────────────────────────────────────────
    const planeH = useMemo(() => {
      const fovRad = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180;
      return 2 * Math.tan(fovRad / 2) * Math.abs(camera.position.z);
    }, [camera]);
    const planeW = useMemo(
      () => planeH * (size.width / size.height),
      [planeH, size],
    );

    // ── Refs de escena ────────────────────────────────────────────────────────
    const groupRef = useRef<THREE.Group>(null);
    const meshRef = useRef<THREE.Mesh>(null);
    const skeletonRef = useRef<HandSkeletonHandle>(null);

    // ── Sincronización de props via refs ──────────────────────────────────────
    const brushSizeRef = useRef<BrushSize>(brushSize);
    const colorRef = useRef<DrawColor>(color);
    const toolRef = useRef<DrawTool>(tool);
    const isLockedRef = useRef(isLocked);

    useEffect(() => { brushSizeRef.current = brushSize; }, [brushSize]);
    useEffect(() => { colorRef.current = color; }, [color]);
    useEffect(() => { toolRef.current = tool; }, [tool]);
    useEffect(() => {
      isLockedRef.current = isLocked;
      if (!isLocked && groupRef.current && meshRef.current) {
        groupRef.current.position.set(0, 0, 0);
        groupRef.current.rotation.set(0, 0, 0);
        meshRef.current.position.set(0, 0, 0);
      }
    }, [isLocked]);

    useEffect(() => {
      gl.domElement.style.touchAction = "none";
    }, [gl]);

    useEffect(() => {
      gl.domElement.style.cursor = isLocked ? "default" : "crosshair";
    }, [isLocked, gl]);

    // ── Hooks ─────────────────────────────────────────────────────────────────
    const { offscreenCanvas, draw2dCtx, texture, textureDirty, applyTool, drawDot, drawSegment } =
      useDrawingCanvas(brushSizeRef, colorRef, toolRef);

    const { clearCanvas, saveSnapshot, undo, redo } = useDrawingHistory({
      draw2dCtx,
      offscreenCanvas,
      textureDirty,
      onHistoryChange,
      onClearFlash,
    });

    const { handlePointerDown, handlePointerMove, stopPointer } = usePointerHandlers({
      isLockedRef,
      offscreenCanvas,
      brushSizeRef,
      draw2dCtx,
      textureDirty,
      applyTool,
      drawDot,
      drawSegment,
      saveSnapshot,
    });

    const { handLandmarkerRef, mpReadyRef } = useMediaPipe({
      videoRef,
      onStatusChange: onMpStatusChange,
    });

    useHandTracking({
      videoRef,
      size,
      planeW,
      planeH,
      handLandmarkerRef,
      mpReadyRef,
      skeletonRef,
    });

    useDevOverlay({ meshRef, planeW, planeH, isLocked });

    useImperativeHandle(
      ref,
      () => ({ clear: clearCanvas, getCanvas: () => offscreenCanvas, undo, redo }),
      [clearCanvas, offscreenCanvas, undo, redo],
    );

    return (
      <>
        <group ref={groupRef}>
          <mesh
            ref={meshRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopPointer}
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

        {/* Esqueleto de manos — fuera del grupo rotante, siempre en world space */}
        <HandSkeleton ref={skeletonRef} />
      </>
    );
  },
);

export default memo(DrawingPlane);
