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
  uniform float uIntro;

  void main() {

    vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec2 ndc = clipPos.xy / clipPos.w;

    float dist = length(ndc - uMouse);

    // Gaussian falloff: max influence at cursor, fades ~0 beyond ~0.6 NDC units
    float falloff = exp(-dist * dist * 4.5);

    // Outward-propagating ripple wave
    float ripple = sin(dist * 14.0 - uTime * 5.0);

    // Intro: global position-based wave that covers the whole mesh, fades to zero
    float introWave = sin(position.y * 10.0 - uTime * 4.0) * cos(position.x * 8.0 + uTime * 2.5);
    float introDisplace = introWave * 0.07 * uIntro;

    // Displace along vertex normal in object space
    vec3 displaced = position + normal * (falloff * ripple * uStrength * uHover + introDisplace);

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
    uIntro: { value: 1.0 },
  },
});

interface ThereminAudio {
  ctx: AudioContext;
  osc: OscillatorNode;
  gain: GainNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  started: boolean; // guards against starting oscillators twice
}

type CaraModelProps = JSX.IntrinsicElements["group"] & {
  audioEnabled?: boolean;
  muted?: boolean;
};

export function CaraModel({
  audioEnabled = false,
  muted = false,
  ...props
}: CaraModelProps) {
  const { nodes } = useGLTF(
    "/models/home/FaceModel2.glb",
  ) as unknown as GLTFResult;

  const groupRef = useRef<THREE.Group>(null);
  const hoverRef = useRef(0);
  const targetHoverRef = useRef(0);
  const introRef = useRef(1.0);
  const { pointer, gl } = useThree();

  // Reset intro animation on mount so it always plays from the start
  useEffect(() => {
    introRef.current = 1.0;
    _material.uniforms.uIntro.value = 1.0;
  }, []);

  const thereminRef = useRef<ThereminAudio | null>(null);

  // Native touch state – bypasses R3F hit-testing so the theremin works
  // anywhere on the canvas, not only when touching the 3D mesh
  const touchActiveRef = useRef(false);
  const touchPosRef = useRef({ x: 0, y: 0 });
  const touchVecRef = useRef(new THREE.Vector2(0, 0));

  // Always-running effect: track native touch position so displacement works
  // on Chrome Android (where R3F's `pointer` doesn't update during drag).
  useEffect(() => {
    const canvas = gl.domElement;
    const toNDC = (touch: Touch) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: ((touch.clientX - r.left) / r.width) * 2 - 1,
        y: -((touch.clientY - r.top) / r.height) * 2 + 1,
      };
    };
    const onStart = (e: TouchEvent) => {
      touchActiveRef.current = true;
      targetHoverRef.current = 1;
      if (e.touches[0]) touchPosRef.current = toNDC(e.touches[0]);
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches[0]) touchPosRef.current = toNDC(e.touches[0]);
    };
    const onEnd = () => {
      touchActiveRef.current = false;
      targetHoverRef.current = 0;
    };
    canvas.addEventListener("touchstart", onStart, { passive: true });
    canvas.addEventListener("touchmove", onMove, { passive: true });
    canvas.addEventListener("touchend", onEnd, { passive: true });
    canvas.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      canvas.removeEventListener("touchstart", onStart);
      canvas.removeEventListener("touchmove", onMove);
      canvas.removeEventListener("touchend", onEnd);
      canvas.removeEventListener("touchcancel", onEnd);
    };
  }, [gl]);

  // Initialize or suspend audio when audioEnabled changes
  useEffect(() => {
    const canvas = gl.domElement;

    if (!audioEnabled) {
      if (thereminRef.current) {
        const { gain, ctx } = thereminRef.current;
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        const timer = setTimeout(() => ctx.suspend(), 400);
        return () => clearTimeout(timer);
      }
      return;
    }

    // ── Audio graph builder ────────────────────────────────────────────────
    const buildGraph = (ctx: AudioContext) => {
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

      return { osc, gain, lfo, lfoGain };
    };

    // ── Two separate initialization paths ─────────────────────────────────
    //
    // iOS Safari REQUIRES that new AudioContext() be called inside the user
    // gesture handler — not just ctx.resume(). When created inside touchstart
    // the context starts in "running" state immediately and oscillators can
    // be started right away. Any other timing leaves the context suspended
    // permanently on iOS regardless of later resume() calls.
    //
    // Desktop browsers (Chrome, Firefox, Safari macOS) are more permissive:
    // the context can be created in useEffect and resumed on first click.
    const isMobile = navigator.maxTouchPoints > 0;

    if (!isMobile && !thereminRef.current) {
      // ── Desktop path: create now, unlock on first interaction ─────────
      try {
        const ctx = new AudioContext();
        const nodes = buildGraph(ctx);

        thereminRef.current = { ctx, ...nodes, started: false };

        ctx.addEventListener("statechange", () => {
          const t = thereminRef.current;
          if (t && ctx.state === "running" && !t.started) {
            t.started = true;
            t.lfo.start();
            t.osc.start();
          }
        });
        void ctx.resume(); // works if user already interacted with the page
      } catch (e) {
        console.warn("Web Audio API unavailable:", e);
        return;
      }
    }

    const onTouchStart = () => {
      if (!thereminRef.current) {
        // ── Mobile path: create AudioContext inside the user gesture ──────
        // On iOS Safari, new AudioContext() called here starts in "running"
        // state immediately. Oscillators can be started right after.
        //
        // iOS routes Web Audio through the "ringer" channel by default, which
        // is muted by the physical silent switch and uses the ringer volume.
        // Playing an <audio> element inside the same gesture switches iOS to
        // the "playback" audio session (media volume, not affected by silent).
        try {
          // Switch iOS audio session to "playback" before creating context
          const probe = new window.Audio();
          probe.src =
            "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
          probe.volume = 0.001;
          probe.play().catch(() => {});

          const ctx = new AudioContext();
          const nodes = buildGraph(ctx);

          // Start oscillators immediately — context IS running at this point
          nodes.lfo.start();
          nodes.osc.start();

          thereminRef.current = { ctx, ...nodes, started: true };
        } catch (e) {
          console.warn("Web Audio API unavailable:", e);
        }
      } else if (thereminRef.current.ctx.state === "suspended") {
        // Re-resume if context was suspended (e.g. app went to background)
        void thereminRef.current.ctx.resume();
      }

    };

    canvas.addEventListener("touchstart", onTouchStart, { passive: true });

    // ── Desktop unlock (document-level) ───────────────────────────────────
    // Handles the case where the desktop AudioContext starts suspended
    // (Chrome requires prior page interaction before ctx.resume() works).
    const removeUnlockListeners = () => {
      document.removeEventListener("mousedown", unlockDesktop);
      document.removeEventListener("pointerdown", unlockDesktop);
      document.removeEventListener("keydown", unlockDesktop);
    };
    function unlockDesktop() {
      const t = thereminRef.current;
      if (!t || t.ctx.state === "running") {
        removeUnlockListeners();
        return;
      }
      const buf = t.ctx.createBuffer(1, 1, 22050);
      const src = t.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(t.ctx.destination);
      src.onended = () => {
        src.disconnect();
        removeUnlockListeners();
      };
      src.start(0);
      void t.ctx.resume();
    }
    if (!isMobile) {
      document.addEventListener("mousedown", unlockDesktop);
      document.addEventListener("pointerdown", unlockDesktop);
      document.addEventListener("keydown", unlockDesktop);
    }

    return () => {
      removeUnlockListeners();
      canvas.removeEventListener("touchstart", onTouchStart);
    };
  }, [audioEnabled, gl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const t = thereminRef.current;
      if (t) {
        if (t.started) {
          // stop() throws if the oscillator was never started
          t.osc.stop();
          t.lfo.stop();
        }
        t.ctx.close();
        thereminRef.current = null;
      }
    };
  }, []);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.4;
    }

    // Frame-rate independent smooth hover (speed=8 → ~99% in ~0.6s).
    // On Android Chrome, R3F fires onPointerLeave mid-drag (raycasting loses
    // the mesh), dropping uHover to 0. Native touch state takes priority.
    const targetHover = touchActiveRef.current ? 1 : targetHoverRef.current;
    hoverRef.current = THREE.MathUtils.lerp(
      hoverRef.current,
      targetHover,
      1 - Math.exp(-8 * delta),
    );

    _material.uniforms.uTime.value += delta;
    _material.uniforms.uHover.value = hoverRef.current;

    // Intro animation: decay from 1 → 0 (speed=1.5 → ~2s to near-zero)
    if (introRef.current > 0.001) {
      introRef.current = THREE.MathUtils.lerp(
        introRef.current,
        0,
        1 - Math.exp(-1.5 * delta),
      );
      _material.uniforms.uIntro.value = introRef.current;
    } else if (_material.uniforms.uIntro.value !== 0) {
      introRef.current = 0;
      _material.uniforms.uIntro.value = 0;
    }

    // Frame-rate independent smooth mouse/touch tracking.
    // On Chrome Android, R3F's `pointer` doesn't update during drag, so use
    // native touch coordinates when a touch is active.
    const targetVec = touchActiveRef.current
      ? touchVecRef.current.set(touchPosRef.current.x, touchPosRef.current.y)
      : pointer;
    _material.uniforms.uMouse.value.lerp(targetVec, 1 - Math.exp(-12 * delta));

    // ── Theremin audio update ──────────────────────────────────────────────
    const t = thereminRef.current;
    if (audioEnabled && t && t.ctx.state === "running") {
      // On mobile: use native touch position (works anywhere on canvas).
      // On desktop: use R3F pointer + mesh hover detection.
      const isTouching = touchActiveRef.current;
      const isActive = isTouching || hoverRef.current > 0.08;
      const ax = isTouching ? touchPosRef.current.x : pointer.x;
      const ay = isTouching ? touchPosRef.current.y : pointer.y;

      // Smoothing factor – frame-rate independent, same pattern as hoverRef
      const smooth = 1 - Math.exp(-8 * delta);

      if (isActive && !muted) {
        // Logarithmic pitch: bottom (-1) → 120 Hz, top (1) → 1400 Hz
        const minFreq = 120;
        const maxFreq = 1400;
        const normY = (ay + 1) / 2;
        const targetFreq = minFreq * Math.pow(maxFreq / minFreq, normY);

        // Linear volume: left (-1) → 0.05, right (1) → 0.45
        const targetVol = THREE.MathUtils.mapLinear(ax, -1, 1, 0.05, 0.45);

        // Direct .value assignment avoids iOS WebKit bugs with AudioParam
        // scheduling (setTargetAtTime) when called from rAF/useFrame.
        // The LFO is connected to osc.frequency and adds vibrato on top of
        // this intrinsic value — both work independently.
        t.osc.frequency.value += (targetFreq - t.osc.frequency.value) * smooth;
        t.gain.gain.value += (targetVol - t.gain.gain.value) * smooth;
      } else {
        t.gain.gain.value += (0 - t.gain.gain.value) * smooth;
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
