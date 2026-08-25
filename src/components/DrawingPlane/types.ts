import type { BrushSize, DrawColor, DrawTool } from "../../constants/drawing";

export interface DrawingCanvasHandle {
  clear: () => void;
  getCanvas: () => HTMLCanvasElement | null;
  undo: () => void;
  redo: () => void;
}

export type MPStatus = "loading" | "ready" | "error";

export interface DrawingPlaneProps {
  brushSize: BrushSize;
  color: DrawColor;
  tool: DrawTool;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  isLocked?: boolean;
  onMpStatusChange?: (status: MPStatus) => void;
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
  onClearFlash?: () => void;
  onPinchDebug?: (data: { label: string; dist: number; active: boolean }[]) => void;
}

export type Point = { x: number; y: number };

export type HandPinchState = {
  isPinchActive: boolean;
  lostFrames: number;
  lastPos: Point | null;
  lastMid: Point | null;
  velocity: Point;
};

export type HandFistState = { fistFrames: number; fistCleared: boolean };
