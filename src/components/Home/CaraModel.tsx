import * as THREE from "three";
import React, { type JSX, useRef, useEffect } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import type { GLTF } from "three-stdlib";

type GLTFResult = GLTF & {
  nodes: {
    Alta: THREE.Mesh;
    Baja: THREE.Mesh;
  };
};

const vertexShader = /* glsl */ `
  precision highp float;

  uniform vec2 uMouse;
  uniform float uTime;
  uniform float uHover;
  uniform float uStrength;

  void main() {

    vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec2 ndc = clipPos.xy / clipPos.w;

    float dist = length(ndc - uMouse);

    // Gaussian falloff: max influence at cursor, fades ~0 beyond ~0.6 NDC units
    float falloff = exp(-dist * dist * 4.5);

    // Outward-propagating ripple wave
    float ripple = sin(dist * 14.0 - uTime * 5.0);

    // Displace along vertex normal in object space
    vec3 displaced = position + normal * (falloff * ripple * uStrength * uHover);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  void main() {
    gl_FragColor = vec4(0.953, 0.953, 0.953, 1.0);
  }
`;

// Material created once at module level – avoids R3F reconciler re-creation issues
// and React Compiler restrictions on mutating hook-created values
const _material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  wireframe: true,
  uniforms: {
    uMouse: { value: new THREE.Vector2(0, 0) },
    uTime: { value: 0 },
    uHover: { value: 0 },
    uStrength: { value: 0.01 },
  },
});

interface ThereminAudio {
  ctx: AudioContext;
  osc: OscillatorNode;
  gain: GainNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
}

type CaraModelProps = JSX.IntrinsicElements["group"] & {
  audioEnabled?: boolean;
  onAudioStateChange?: (state: AudioContextState | null) => void;
};

export function CaraModel({ audioEnabled = false, onAudioStateChange, ...props }: CaraModelProps) {
  const { nodes } = useGLTF(
    "/models/home/FaceModel2.glb",
  ) as unknown as GLTFResult;

  const groupRef = useRef<THREE.Group>(null);
  const hoverRef = useRef(0);
  const targetHoverRef = useRef(0);
  const { pointer, gl } = useThree();

  const thereminRef = useRef<ThereminAudio | null>(null);

  // Native touch state – bypasses R3F hit-testing so the theremin works
  // anywhere on the canvas, not only when touching the 3D mesh
  const touchActiveRef = useRef(false);
  const touchPosRef = useRef({ x: 0, y: 0 });

  // Initialize or suspend audio when audioEnabled changes
  useEffect(() => {
    const canvas = gl.domElement;

    if (!audioEnabled) {
      onAudioStateChange?.(null);
      if (thereminRef.current) {
        const { gain, ctx } = thereminRef.current;
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        const timer = setTimeout(() => ctx.suspend(), 400);
        return () => clearTimeout(timer);
      }
      return;
    }

    // Create AudioContext once – it starts suspended on mobile (that's fine)
    if (!thereminRef.current) {
      try {
        const ctx = new AudioContext();

        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = 440;

        const gain = ctx.createGain();
        gain.gain.value = 0;

        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 5.2;
        lfoGain.gain.value = 7;

        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        osc.connect(gain);
        gain.connect(ctx.destination);

        lfo.start();
        osc.start();

        thereminRef.current = { ctx, osc, gain, lfo, lfoGain };
      } catch (e) {
        console.warn("Web Audio API unavailable:", e);
        return;
      }
    }

    const { ctx } = thereminRef.current;

    // Report state changes (suspended ↔ running) to parent for debug UI
    const onStateChange = () => onAudioStateChange?.(ctx.state);
    ctx.addEventListener("statechange", onStateChange);
    onAudioStateChange?.(ctx.state); // emit current state immediately

    // unlock() is called inside native DOM gesture events so all browsers
    // accept it as a valid user gesture. The silent buffer is required to
    // fully unlock iOS Safari (resume() alone is not always sufficient).
    // No { once:true } – the context can become suspended again and needs
    // to be re-resumed on the next gesture.
    const unlock = () => {
      if (ctx.state === "running") return;
      const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start();
      ctx.resume();
    };

    // ── Touch position tracking (bypasses R3F hit-testing) ─────────────────
    // On mobile, onPointerEnter/Down only fire when the touch hits the mesh
    // geometry. This means touching between wireframe lines gives no audio.
    // Native touch listeners read the finger position from the canvas rect
    // directly, so the theremin works anywhere on the canvas.
    const toNDC = (touch: Touch) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: ((touch.clientX - r.left) / r.width) * 2 - 1,
        y: -((touch.clientY - r.top) / r.height) * 2 + 1,
      };
    };

    const onTouchStart = (e: TouchEvent) => {
      unlock(); // also unlock AudioContext on this gesture
      touchActiveRef.current = true;
      touchPosRef.current = toNDC(e.touches[0]);
    };
    const onTouchMove = (e: TouchEvent) => {
      touchPosRef.current = toNDC(e.touches[0]);
    };
    const onTouchEnd = () => {
      touchActiveRef.current = false;
    };

    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: true });
    canvas.addEventListener("touchend", onTouchEnd, { passive: true });

    // pointerdown / click for desktop unlock
    canvas.addEventListener("pointerdown", unlock);
    canvas.addEventListener("click", unlock);

    // Attempt immediate resume – works on desktop if user has already
    // interacted with the page anywhere before reaching the canvas
    unlock();

    return () => {
      ctx.removeEventListener("statechange", onStateChange);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("pointerdown", unlock);
      canvas.removeEventListener("click", unlock);
    };
  }, [audioEnabled, gl, onAudioStateChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const t = thereminRef.current;
      if (t) {
        t.gain.gain.setValueAtTime(0, t.ctx.currentTime);
        t.osc.stop();
        t.lfo.stop();
        t.ctx.close();
        thereminRef.current = null;
      }
    };
  }, []);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.4;
    }

    // Frame-rate independent smooth hover (speed=8 → ~99% in ~0.6s)
    hoverRef.current = THREE.MathUtils.lerp(
      hoverRef.current,
      targetHoverRef.current,
      1 - Math.exp(-8 * delta),
    );

    _material.uniforms.uTime.value += delta;
    _material.uniforms.uHover.value = hoverRef.current;

    // Frame-rate independent smooth mouse/touch tracking
    _material.uniforms.uMouse.value.lerp(pointer, 1 - Math.exp(-12 * delta));

    // ── Theremin audio update ──────────────────────────────────────────────
    const t = thereminRef.current;
    if (audioEnabled && t && t.ctx.state === "running") {
      // On mobile: use native touch position (works anywhere on canvas).
      // On desktop: use R3F pointer + mesh hover detection.
      const isTouching = touchActiveRef.current;
      const isActive = isTouching || hoverRef.current > 0.08;
      const ax = isTouching ? touchPosRef.current.x : pointer.x;
      const ay = isTouching ? touchPosRef.current.y : pointer.y;

      if (isActive) {
        // Logarithmic pitch: bottom (-1) → 120 Hz, top (1) → 1400 Hz
        const minFreq = 120;
        const maxFreq = 1400;
        const normY = (ay + 1) / 2;
        const freq = minFreq * Math.pow(maxFreq / minFreq, normY);

        // Linear volume: left (-1) → 0.05, right (1) → 0.45
        // Minimum 0.05 so mobile users always hear something regardless of X
        const vol = THREE.MathUtils.mapLinear(ax, -1, 1, 0.05, 0.45);

        t.osc.frequency.setTargetAtTime(freq, t.ctx.currentTime, 0.04);
        t.gain.gain.setTargetAtTime(vol, t.ctx.currentTime, 0.04);
      } else {
        t.gain.gain.setTargetAtTime(0, t.ctx.currentTime, 0.15);
      }
    }
  });

  return (
    <group ref={groupRef} {...props} dispose={null}>
      <mesh
        geometry={nodes.Baja.geometry}
        material={_material}
        onPointerEnter={() => {
          targetHoverRef.current = 1;
          // Resume AudioContext here – pointer events are valid user gestures
          thereminRef.current?.ctx.resume();
        }}
        onPointerLeave={() => {
          targetHoverRef.current = 0;
        }}
        onPointerDown={() => {
          targetHoverRef.current = 1;
          // Also resume here – on mobile, pointerdown is the most reliable
          // direct user gesture (iOS Safari requires synchronous resume)
          thereminRef.current?.ctx.resume();
        }}
        onPointerUp={() => {
          targetHoverRef.current = 0;
        }}
      />
    </group>
  );
}

useGLTF.preload("/models/home/FaceModel2.glb");
