import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";

// Pares de índices de landmarks (0-20) que forman el esqueleto de la mano,
// según la topología estándar de MediaPipe Hands.
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const LANDMARKS_PER_HAND = 21;
const MAX_HANDS = 2;
const Z_OFFSET = 0.02;
const DOT_COLOR = "#ff4444";
const LINE_COLOR = "#ff4444";

export type WorldPoint = { x: number; y: number };

export interface HandSkeletonHandle {
  update: (hands: WorldPoint[][], dotRadius: number) => void;
}

const HandSkeleton = forwardRef<HandSkeletonHandle>(function HandSkeleton(_, ref) {
  const dotsRef = useRef<THREE.InstancedMesh>(null);
  const lineRefs = [
    useRef<THREE.LineSegments>(null),
    useRef<THREE.LineSegments>(null),
  ];

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const lineGeometries = useMemo(
    () =>
      Array.from({ length: MAX_HANDS }, () => {
        const geom = new THREE.BufferGeometry();
        geom.setAttribute(
          "position",
          new THREE.BufferAttribute(new Float32Array(HAND_CONNECTIONS.length * 6), 3),
        );
        return geom;
      }),
    [],
  );

  // Evita un flash inicial: sin datos todavía, no renderizar instancias.
  useEffect(() => {
    if (dotsRef.current) dotsRef.current.count = 0;
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      update(hands, dotRadius) {
        const dots = dotsRef.current;
        if (dots) {
          let count = 0;
          for (const hand of hands) {
            for (const p of hand) {
              dummy.position.set(p.x, p.y, Z_OFFSET);
              dummy.scale.setScalar(dotRadius);
              dummy.updateMatrix();
              dots.setMatrixAt(count, dummy.matrix);
              count++;
            }
          }
          dots.count = count;
          dots.instanceMatrix.needsUpdate = true;
        }

        for (let h = 0; h < MAX_HANDS; h++) {
          const line = lineRefs[h].current;
          if (!line) continue;
          const hand = hands[h];
          if (!hand) {
            line.visible = false;
            continue;
          }
          line.visible = true;
          const attr = line.geometry.attributes.position as THREE.BufferAttribute;
          const positions = attr.array as Float32Array;
          HAND_CONNECTIONS.forEach(([a, b], i) => {
            const pa = hand[a];
            const pb = hand[b];
            positions[i * 6] = pa.x;
            positions[i * 6 + 1] = pa.y;
            positions[i * 6 + 2] = Z_OFFSET;
            positions[i * 6 + 3] = pb.x;
            positions[i * 6 + 4] = pb.y;
            positions[i * 6 + 5] = Z_OFFSET;
          });
          attr.needsUpdate = true;
        }
      },
    }),
    [dummy],
  );

  return (
    <>
      <instancedMesh
        ref={dotsRef}
        args={[undefined, undefined, LANDMARKS_PER_HAND * MAX_HANDS]}
        renderOrder={10}
        frustumCulled={false}
      >
        <circleGeometry args={[1, 12]} />
        <meshBasicMaterial color={DOT_COLOR} depthTest={false} depthWrite={false} />
      </instancedMesh>

      {lineRefs.map((lr, i) => (
        <lineSegments
          key={i}
          ref={lr}
          geometry={lineGeometries[i]}
          visible={false}
          renderOrder={9}
          frustumCulled={false}
        >
          <lineBasicMaterial color={LINE_COLOR} depthTest={false} depthWrite={false} />
        </lineSegments>
      ))}
    </>
  );
});

export default HandSkeleton;
