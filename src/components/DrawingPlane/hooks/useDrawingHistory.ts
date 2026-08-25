import { useRef, useCallback } from "react";

const MAX_HISTORY = 3;

interface UseDrawingHistoryParams {
  draw2dCtx: CanvasRenderingContext2D;
  offscreenCanvas: HTMLCanvasElement;
  textureDirty: React.RefObject<boolean>;
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
  onClearFlash?: () => void;
}

export function useDrawingHistory({
  draw2dCtx,
  offscreenCanvas,
  textureDirty,
  onHistoryChange,
  onClearFlash,
}: UseDrawingHistoryParams) {
  const undoStack = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);

  const clearCanvas = useCallback(() => {
    draw2dCtx.globalCompositeOperation = "source-over";
    draw2dCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
    textureDirty.current = true;
    undoStack.current = [];
    redoStack.current = [];
    onHistoryChange?.(false, false);
    onClearFlash?.();
  }, [draw2dCtx, offscreenCanvas, textureDirty, onHistoryChange, onClearFlash]);

  const saveSnapshot = useCallback(() => {
    const snap = draw2dCtx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height);
    undoStack.current.push(snap);
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
    redoStack.current = [];
    onHistoryChange?.(true, false);
  }, [draw2dCtx, offscreenCanvas, onHistoryChange]);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const current = draw2dCtx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height);
    redoStack.current.push(current);
    if (redoStack.current.length > MAX_HISTORY) redoStack.current.shift();
    const prev = undoStack.current.pop()!;
    draw2dCtx.globalCompositeOperation = "source-over";
    draw2dCtx.putImageData(prev, 0, 0);
    textureDirty.current = true;
    onHistoryChange?.(undoStack.current.length > 0, true);
  }, [draw2dCtx, offscreenCanvas, textureDirty, onHistoryChange]);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const current = draw2dCtx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height);
    undoStack.current.push(current);
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
    const next = redoStack.current.pop()!;
    draw2dCtx.globalCompositeOperation = "source-over";
    draw2dCtx.putImageData(next, 0, 0);
    textureDirty.current = true;
    onHistoryChange?.(true, redoStack.current.length > 0);
  }, [draw2dCtx, offscreenCanvas, textureDirty, onHistoryChange]);

  return { clearCanvas, saveSnapshot, undo, redo };
}
