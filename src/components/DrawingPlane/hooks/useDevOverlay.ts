import { useEffect } from "react";
import * as THREE from "three";
import { IS_DEV } from "../constants";

interface UseDevOverlayParams {
  meshRef: React.RefObject<THREE.Mesh | null>;
  planeW: number;
  planeH: number;
  isLocked: boolean;
}

export function useDevOverlay({ meshRef, planeW, planeH, isLocked }: UseDevOverlayParams) {
  useEffect(() => {
    if (!IS_DEV || !isLocked || !meshRef.current) return;
    const hw = planeW / 2, hh = planeH / 2;

    const group = new THREE.Group();

    // Borde discontinuo (LineLoop)
    const loopGeo = new THREE.BufferGeometry();
    loopGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array([-hw, hh, 0.01, hw, hh, 0.01, hw, -hh, 0.01, -hw, -hh, 0.01]),
        3,
      ),
    );
    const loopMat = new THREE.LineDashedMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.75,
      dashSize: 0.15,
      gapSize: 0.07,
      depthTest: false,
    });
    const loop = new THREE.LineLoop(loopGeo, loopMat);
    loop.computeLineDistances();
    loop.renderOrder = 11;
    group.add(loop);

    // Puntos en esquinas
    for (const [cx, cy] of [
      [-hw, hh],
      [hw, hh],
      [hw, -hh],
      [-hw, -hh],
    ] as [number, number][]) {
      const geo = new THREE.CircleGeometry(0.04, 16);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
      });
      const dot = new THREE.Mesh(geo, mat);
      dot.position.set(cx, cy, 0.01);
      dot.renderOrder = 12;
      group.add(dot);
    }

    // Eje X (rojo) y eje Y invertido (verde, "abajo" en el canvas de dibujo)
    const xArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0.01),
      hw / 3,
      0xff4444,
      0.15,
      0.08,
    );
    xArrow.renderOrder = 12;
    group.add(xArrow);

    const yArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 0.01),
      hh / 3,
      0x44ff88,
      0.15,
      0.08,
    );
    yArrow.renderOrder = 12;
    group.add(yArrow);

    // Punto central
    const cGeo = new THREE.CircleGeometry(0.04, 16);
    const cMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
    const cDot = new THREE.Mesh(cGeo, cMat);
    cDot.position.set(0, 0, 0.01);
    cDot.renderOrder = 12;
    group.add(cDot);

    const mesh = meshRef.current;
    mesh.add(group);

    return () => {
      mesh.remove(group);
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else (obj.material as THREE.Material).dispose();
        }
      });
    };
  }, [planeW, planeH, isLocked, meshRef]);
}
