import * as THREE from "three";
import React, { type JSX, useRef, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { GLTF } from "three-stdlib";
// import { useThree } from "@react-three/fiber";
// import { LineMaterial } from "three/addons/lines/LineMaterial.js";
// import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
// import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";

type GLTFResult = GLTF & {
  nodes: {
    Alta: THREE.Mesh;
    Baja: THREE.Mesh;
  };
};

export function CaraModel(props: JSX.IntrinsicElements["group"]) {
  const { nodes } = useGLTF(
    "/models/home/FaceModel2.glb",
  ) as unknown as GLTFResult;

  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.4;
    }
  });

  const wireframeMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0xf3f3f3,
        wireframe: true,
      }),
    [],
  );

  return (
    <group ref={groupRef} {...props} dispose={null}>
      <mesh geometry={nodes.Baja.geometry} material={wireframeMaterial} />
      {/* <WireframeLines geometry={nodes.Baja.geometry} material={lineMaterial} /> */}
    </group>
  );
}

useGLTF.preload("/models/home/FaceModel2.glb");
