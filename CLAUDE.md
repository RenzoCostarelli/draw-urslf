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

**Never** use npm, always pnpm.

## Project overview

This is a multi-page digital experimentation lab site (`rnz0_`) built with React 19 + Vite. It contains interactive WebGL/Three.js experiments, a lab index, and is designed to eventually host a blog. The site uses React Router for client-side routing with a shared layout (Navbar).

## Routing & layout

- `App.tsx` — React Router v6 setup; all routes share `RootLayout`
- `src/layouts/RootLayout.tsx` — Shared layout: `div.flex.flex-col.h-full` → `Navbar (sticky)` + `main.flex-1.overflow-y-auto`
- `src/components/Navbar/` — Sticky top navbar (in the flex flow, not fixed)

**Height chain for full-screen experiments:**
`html/body/#root { height: 100% }` → `RootLayout div.h-full` → `main.flex-1` → page component `h-full` → canvas `absolute inset-0`

**Scrolling pages** (Home, Lab, Blog): content scrolls inside `<main class="overflow-y-auto">` naturally.
**Full-screen pages** (draw-urslf): use `h-full` on the root element; the canvas fills the viewport area below the navbar.

## Pages

| Route | File | Type |
|---|---|---|
| `/` | `src/pages/Home.tsx` | Scrollable |
| `/lab` | `src/pages/lab/index.tsx` | Scrollable — experiment index |
| `/lab/draw-urslf` | `src/pages/lab/draw-urslf/index.tsx` | Full-screen canvas |

## draw-urslf experiment

3D interactive experience: live webcam feed as a Three.js scene background, hand-tracking via MediaPipe, and finger-painting with gesture controls.

**Rendering pipeline:**
- `WebcamPlane.tsx` — accesses webcam via `getUserMedia`, creates a Three.js video texture, sets it as `scene.background`
- `DrawingPlane/` — MediaPipe hand tracking + drawing canvas rendered as a Three.js plane
- `Toolbar.tsx` — floating UI controls (brush, color, record, undo/redo)

**Key patterns:**
- Use `useFrame` for per-frame animation (receives `state` and `delta`)
- Use `useRef<THREE.Mesh>` for direct mesh mutation (avoid re-renders)
- Webcam resources must be cleaned up in `useEffect` return: stop video tracks and dispose Three.js textures
- Webcam video texture is horizontally mirrored via `texture.repeat.set(-1, 1)` and `texture.offset.set(1, 0)`
- `gl={{ preserveDrawingBuffer: true }}` is required for `captureStream` recording

## Architecture notes

**TypeScript:** Strict mode with `noUnusedLocals` and `noUnusedParameters` enforced.

**Styling:** Tailwind CSS v4. Global CSS in `src/index.css`; CSS variables for fonts and theming in `:root`. `html, body, #root` are set to `height: 100%; overflow: hidden` to contain full-screen experiments — scrollable pages scroll within `<main>`.
