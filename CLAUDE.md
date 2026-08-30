# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from `draw-urslf/` using `pnpm`:

```bash
pnpm dev          # Start dev server with HMR
pnpm build        # Type-check (tsc -b) then Vite build
pnpm lint         # Run ESLint
pnpm preview      # Preview production build
```

There is no test runner configured in this project.

## Architecture

This is a 3D interactive web app built with React 19, Three.js, and React Three Fiber. The core concept is rendering a live webcam feed as a Three.js scene background, with 3D objects composited on top.

**Never** use npm, always pnpm
**Rendering pipeline:**

- `main.tsx` → `App.tsx` mounts a full-screen `<Canvas>` (React Three Fiber)
- `WebcamPlane.tsx` accesses the webcam via `getUserMedia`, creates a Three.js video texture, and sets it as `scene.background` — it renders no mesh itself
- 3D objects (e.g., `SpinningCube.tsx`) are layered on top of the webcam background
- `OrbitControls` (from Drei) allow camera rotation; zoom is disabled

**Key patterns:**

- Use `useFrame` for per-frame animation (receives `state` and `delta`)
- Use `useRef<THREE.Mesh>` for direct mesh mutation (avoid re-renders for animation)
- Webcam resources must be cleaned up in `useEffect` return: stop video tracks and dispose Three.js textures
- Webcam video texture is horizontally mirrored via `texture.repeat.set(-1, 1)` and `texture.offset.set(1, 0)`

**TypeScript:** Strict mode with `noUnusedLocals` and `noUnusedParameters` enforced. Shared Three.js types live in `src/types/three.ts`.

**Styling:** Tailwind CSS v4 (PostCSS-based). Global CSS variables for theming are in `src/index.css`.
