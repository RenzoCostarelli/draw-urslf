import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// COOP + COEP headers are required for SharedArrayBuffer, which MediaPipe's
// WASM runtime needs for multi-threaded execution. Without them the WASM
// either hangs or fails silently in Chrome/Edge/Firefox.
const securityHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
}

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: { headers: securityHeaders },
  preview: { headers: securityHeaders },
})
