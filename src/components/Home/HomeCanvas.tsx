import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { Perf } from "r3f-perf";
import { CaraModel } from "./CaraModel";

export default function HomeCanvas() {
  return (
    <Canvas
      camera={{
        position: [0, 0, 5],
        fov: 45,
        near: 0.1,
        far: 100,
      }}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      className="h-full w-full"
    >
      {/* <OrbitControls enableDamping dampingFactor={0.05} /> */}
      <CaraModel scale={7} position={[0, -1.5, 0]} />
      <EffectComposer multisampling={2}>
        <Bloom
          intensity={0.5}
          luminanceThreshold={2}
          luminanceSmoothing={0.9}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  );
}
