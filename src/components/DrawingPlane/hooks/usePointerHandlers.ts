import { useRef, useCallback } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { BRUSH_SIZES } from "../../../constants/drawing";
import type { BrushSize } from "../../../constants/drawing";
import type { Point } from "../types";

interface UsePointerHandlersParams {
  isLockedRef: React.RefObject<boolean>;
  offscreenCanvas: HTMLCanvasElement;
  brushSizeRef: React.RefObject<BrushSize>;
  draw2dCtx: CanvasRenderingContext2D;
  textureDirty: React.RefObject<boolean>;
  applyTool: (ctx: CanvasRenderingContext2D) => void;
  drawDot: (x: number, y: number) => void;
  drawSegment: (fromMid: Point, control: Point, toMid: Point) => void;
  saveSnapshot: () => void;
}

export function usePointerHandlers({
  isLockedRef,
  offscreenCanvas,
  brushSizeRef,
  draw2dCtx,
  textureDirty,
  applyTool,
  drawDot,
  drawSegment,
  saveSnapshot,
}: UsePointerHandlersParams) {
  const isDrawing = useRef(false);
  const lastPos = useRef<Point | null>(null);
  const lastMid = useRef<Point | null>(null);

  const uvToCanvas = useCallback(
    (uv: THREE.Vector2): Point => ({
      x: uv.x * offscreenCanvas.width,
      y: (1 - uv.y) * offscreenCanvas.height,
    }),
    [offscreenCanvas],
  );

  const handlePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (isLockedRef.current || !e.uv) return;
      e.stopPropagation();
      saveSnapshot();
      isDrawing.current = true;
      const pos = uvToCanvas(e.uv);
      lastPos.current = pos;
      lastMid.current = pos;
      drawDot(pos.x, pos.y);
    },
    [drawDot, isLockedRef, saveSnapshot, uvToCanvas],
  );

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (isLockedRef.current || !isDrawing.current || !e.uv || !lastPos.current || !lastMid.current) return;
      e.stopPropagation();
      const pos = uvToCanvas(e.uv);
      const prev = lastPos.current;
      const newMid: Point = { x: (prev.x + pos.x) / 2, y: (prev.y + pos.y) / 2 };
      drawSegment(lastMid.current, prev, newMid);
      lastMid.current = newMid;
      lastPos.current = pos;
    },
    [drawSegment, isLockedRef, uvToCanvas],
  );

  const stopPointer = useCallback(() => {
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
  }, [applyTool, brushSizeRef, draw2dCtx, isLockedRef, textureDirty]);

  return { handlePointerDown, handlePointerMove, stopPointer };
}
