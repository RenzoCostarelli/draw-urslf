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
};

export function CaraModel({ audioEnabled = false, ...props }: CaraModelProps) {
  const { nodes } = useGLTF(
    "/models/home/FaceModel2.glb",
  ) as unknown as GLTFResult;

  const groupRef = useRef<THREE.Group>(null);
  const hoverRef = useRef(0);
  const targetHoverRef = useRef(0);
  const { pointer } = useThree();

  const thereminRef = useRef<ThereminAudio | null>(null);

  // Initialize or suspend audio when audioEnabled changes
  useEffect(() => {
    if (audioEnabled) {
      if (!thereminRef.current) {
        try {
          const ctx = new AudioContext();
          // AudioContext starts suspended until a user gesture – resume() is
          // called again in onPointerEnter to satisfy the autoplay policy
          ctx.resume();

          // Main oscillator – sine for clean theremin tone
          const osc = ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.value = 440;

          // Master gain (volume)
          const gain = ctx.createGain();
          gain.gain.value = 0;

          // LFO for subtle vibrato
          const lfo = ctx.createOscillator();
          const lfoGain = ctx.createGain();
          lfo.frequency.value = 5.2; // 5.2 Hz vibrato rate
          lfoGain.gain.value = 7;    // ±7 Hz frequency deviation

          // lfo → lfoGain → osc.frequency (modulates pitch)
          lfo.connect(lfoGain);
          lfoGain.connect(osc.frequency);

          // osc → gain → speakers
          osc.connect(gain);
          gain.connect(ctx.destination);

          lfo.start();
          osc.start();

          thereminRef.current = { ctx, osc, gain, lfo, lfoGain };
        } catch (e) {
          console.warn("Web Audio API unavailable:", e);
        }
      } else {
        thereminRef.current.ctx.resume();
      }
    } else {
      if (thereminRef.current) {
        const { gain, ctx } = thereminRef.current;
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        // Suspend after the fade-out
        const timer = setTimeout(() => ctx.suspend(), 400);
        return () => clearTimeout(timer);
      }
    }
  }, [audioEnabled]);

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
      const isHovering = hoverRef.current > 0.08;

      if (isHovering) {
        // Logarithmic pitch mapping: bottom (-1) → 120 Hz, top (1) → 1400 Hz
        const minFreq = 120;
        const maxFreq = 1400;
        const normY = (pointer.y + 1) / 2; // remap [-1,1] → [0,1]
        const freq = minFreq * Math.pow(maxFreq / minFreq, normY);

        // Linear volume mapping: left (-1) → 0, right (1) → 0.45
        const vol = THREE.MathUtils.mapLinear(pointer.x, -1, 1, 0, 0.45);

        t.osc.frequency.setTargetAtTime(freq, t.ctx.currentTime, 0.04);
        t.gain.gain.setTargetAtTime(Math.max(0, vol), t.ctx.currentTime, 0.04);
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
