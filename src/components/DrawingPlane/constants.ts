export const IS_DEV = import.meta.env.DEV;
export const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export const PINCH_START = 0.15;
export const PINCH_STOP = 0.18;
export const PINCH_LOST_TOLERANCE = 4;

// Resolución del canvas de dibujo (independiente de la pantalla)
export const CANVAS_MAX = IS_MOBILE ? 1536 : 2048;
// Intervalo mínimo entre inferencias MediaPipe (ms)
export const MP_THROTTLE_MS = IS_MOBILE ? 1000 / 15 : 1000 / 30;
