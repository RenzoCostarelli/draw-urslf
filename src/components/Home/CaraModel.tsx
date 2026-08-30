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

// function WireframeLines({
//   geometry,
//   material,
// }: {
//   geometry: THREE.BufferGeometry;
//   material: LineMaterial;
// }) {
//   const lineSegments = useMemo(() => {
//     const edges = new THREE.EdgesGeometry(geometry);
//     const lineGeo = new LineSegmentsGeometry().fromEdgesGeometry(edges);
//     return new LineSegments2(lineGeo, material);
//   }, [geometry, material]);
//
//   return <primitive object={lineSegments} />;
// }

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

  // const { size } = useThree();

  // const lineMaterial = useMemo(
  //   () =>
  //     new LineMaterial({
  //       color: 0xffffff,
  //       linewidth: 1,
  //       resolution: new THREE.Vector2(size.width, size.height),
  //     }),
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  //   [],
  // );

  // useEffect(() => {
  //   lineMaterial.resolution.set(size.width, size.height);
  // }, [lineMaterial, size]);

  const wireframeMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
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
