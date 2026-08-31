import * as THREE from "three";
import React, { type JSX, useRef } from "react";
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

export function CaraModel(props: JSX.IntrinsicElements["group"]) {
  const { nodes } = useGLTF(
    "/models/home/FaceModel2.glb",
  ) as unknown as GLTFResult;

  const groupRef = useRef<THREE.Group>(null);
  const hoverRef = useRef(0);
  const targetHoverRef = useRef(0);
  const { pointer } = useThree();

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
  });

  return (
    <group ref={groupRef} {...props} dispose={null}>
      <mesh
        geometry={nodes.Baja.geometry}
        material={_material}
        onPointerEnter={() => {
          targetHoverRef.current = 1;
        }}
        onPointerLeave={() => {
          targetHoverRef.current = 0;
        }}
        onPointerDown={() => {
          targetHoverRef.current = 1;
        }}
        onPointerUp={() => {
          targetHoverRef.current = 0;
        }}
      />
    </group>
  );
}

useGLTF.preload("/models/home/FaceModel2.glb");
