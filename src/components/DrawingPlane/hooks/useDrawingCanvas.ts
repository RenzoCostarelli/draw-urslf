import { useMemo, useRef, useEffect, useCallback } from "react";
import * as THREE from "three";
import { BRUSH_SIZES, COLORS } from "../../../constants/drawing";
import type { BrushSize, DrawColor, DrawTool } from "../../../constants/drawing";
import { CANVAS_MAX } from "../constants";
import type { Point } from "../types";

export function useDrawingCanvas(
  brushSizeRef: React.RefObject<BrushSize>,
  colorRef: React.RefObject<DrawColor>,
  toolRef: React.RefObject<DrawTool>,
) {
  const offscreenCanvas = useMemo(() => {
    const aspect = window.innerWidth / window.innerHeight;
    const cw = aspect >= 1 ? CANVAS_MAX : Math.max(1, Math.round(CANVAS_MAX * aspect));
    const ch = aspect >= 1 ? Math.max(1, Math.round(CANVAS_MAX / aspect)) : CANVAS_MAX;
    const c = document.createElement("canvas");
    c.width = cw;
    c.height = ch;
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

  const textureDirty = useRef(false);

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
  }, [colorRef, toolRef]);

  const drawDot = useCallback(
    (x: number, y: number) => {
      applyTool(draw2dCtx);
      draw2dCtx.beginPath();
      draw2dCtx.arc(x, y, BRUSH_SIZES[brushSizeRef.current] / 2, 0, Math.PI * 2);
      draw2dCtx.fill();
      textureDirty.current = true;
    },
    [applyTool, brushSizeRef, draw2dCtx],
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
    [applyTool, brushSizeRef, draw2dCtx],
  );

  return { offscreenCanvas, draw2dCtx, texture, textureDirty, applyTool, drawDot, drawSegment };
}
