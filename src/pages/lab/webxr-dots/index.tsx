import { Canvas, useFrame } from "@react-three/fiber";
import type { RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Perf } from "r3f-perf";
import {
  createXRStore,
  XR,
  XRDomOverlay,
  IfInSessionMode,
  useXRHitTest,
  type XRStore,
} from "@react-three/xr";

const NOISE_SCALE = 0.5;
const NOISE_SPEED = 0.15;
const DISPLACEMENT = 0.6;
const POINT_SIZE = 10;

const xrStore = createXRStore();

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uNoiseScale;
  uniform float uDisplacement;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  void main() {
    vec3 pos = position;
    vec3 samplePos = pos * uNoiseScale;

    float nx = snoise(samplePos + vec3(0.0, 0.0, uTime));
    float ny = snoise(samplePos + vec3(37.0, 0.0, uTime));
    float nz = snoise(samplePos + vec3(0.0, 57.0, uTime));

    pos += vec3(nx, ny, nz) * uDisplacement;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = uSize / -mvPosition.z;
  }
`;

const fragmentShader = /* glsl */ `
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    if (length(uv) > 0.5) discard;
    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
  }
`;

function ParticleCloud({
  count,
  radius,
  noiseScale = NOISE_SCALE,
  displacement = DISPLACEMENT,
  pointSize = POINT_SIZE,
}: {
  count: number;
  radius: number;
  noiseScale?: number;
  displacement?: number;
  pointSize?: number;
}) {
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  useEffect(() => {
    const geometry = geometryRef.current;
    if (!geometry) return;

    const positions = new Float32Array(count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.randomDirection().multiplyScalar(radius * Math.cbrt(Math.random()));
      positions[i * 3] = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;
    }

    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
  }, [count, radius]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSize: { value: pointSize },
      uNoiseScale: { value: noiseScale },
      uDisplacement: { value: displacement },
    }),
    [pointSize, noiseScale, displacement],
  );

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value =
        state.clock.elapsedTime * NOISE_SPEED;
    }
  });

  return (
    <points>
      <bufferGeometry ref={geometryRef} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </points>
  );
}

function Reticle({
  matrixRef,
}: {
  matrixRef: RefObject<THREE.Matrix4 | null>;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useXRHitTest((results, getWorldMatrix) => {
    if (results.length === 0) {
      matrixRef.current = null;
      if (groupRef.current) groupRef.current.visible = false;
      return;
    }
    if (!matrixRef.current) matrixRef.current = new THREE.Matrix4();
    getWorldMatrix(matrixRef.current, results[0]);
    if (groupRef.current) {
      groupRef.current.visible = true;
      groupRef.current.position.setFromMatrixPosition(matrixRef.current);
      groupRef.current.quaternion.setFromRotationMatrix(matrixRef.current);
    }
  }, "viewer");

  return (
    <group ref={groupRef} visible={false}>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.06, 0.08, 32]} />
        <meshBasicMaterial color="white" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function ARPlacement() {
  const hitMatrixRef = useRef<THREE.Matrix4 | null>(null);
  const [placement, setPlacement] = useState<{
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
  } | null>(null);

  const handlePlace = () => {
    const matrix = hitMatrixRef.current;
    if (!matrix) return;
    setPlacement({
      position: new THREE.Vector3().setFromMatrixPosition(matrix),
      quaternion: new THREE.Quaternion().setFromRotationMatrix(matrix),
    });
  };

  return (
    <>
      {!placement && <Reticle matrixRef={hitMatrixRef} />}
      {placement && (
        <group position={placement.position} quaternion={placement.quaternion}>
          <ParticleCloud
            count={20000}
            radius={0.3}
            noiseScale={2}
            displacement={0.08}
            pointSize={6}
          />
        </group>
      )}
      <XRDomOverlay>
        <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-10">
          {!placement ? (
            <button
              onClick={handlePlace}
              className="pointer-events-auto rounded-full bg-white px-6 py-3 text-sm font-medium text-neutral-900"
            >
              Tocar para colocar
            </button>
          ) : (
            <button
              onClick={() => setPlacement(null)}
              className="pointer-events-auto rounded-full bg-white px-6 py-3 text-sm font-medium text-neutral-900"
            >
              Reposicionar
            </button>
          )}
        </div>
      </XRDomOverlay>
    </>
  );
}

function ArButton({ store }: { store: XRStore }) {
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    navigator.xr
      ?.isSessionSupported("immersive-ar")
      .then(setSupported)
      .catch(() => setSupported(false));
  }, []);

  if (!supported) return null;

  return (
    <button
      onClick={() => store.enterAR()}
      className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full bg-white px-6 py-3 text-sm font-medium text-neutral-900"
    >
      Entrar en AR
    </button>
  );
}

export default function DrawUrslf() {
  return (
    <div className="relative w-full h-full bg-neutral-900 flex-1">
      <title>webxr | *.lab /rnz0_</title>
      <meta name="description" content="Proyecto investigación webxr" />
      <meta property="og:title" content="*.lab /rnz0_" />
      <meta property="og:description" content="Proyecto investigación webxr" />
      <meta property="og:type" content="website" />

      <div className="absolute h-svh w-svw">
        <Canvas
          camera={{ position: [0, 0, 6], fov: 60 }}
          className="w-full h-full"
          style={{ touchAction: "none" }}
          dpr={[1, 2]}
          gl={{
            preserveDrawingBuffer: true,
            antialias: false,
            powerPreference: "high-performance",
          }}
        >
          <XR store={xrStore}>
            <IfInSessionMode deny="immersive-ar">
              <ParticleCloud count={100000} radius={3} />
            </IfInSessionMode>
            <IfInSessionMode allow="immersive-ar">
              <ARPlacement />
            </IfInSessionMode>
          </XR>
          {import.meta.env.DEV && <Perf position="top-right" />}
        </Canvas>
        <ArButton store={xrStore} />
      </div>
    </div>
  );
}
