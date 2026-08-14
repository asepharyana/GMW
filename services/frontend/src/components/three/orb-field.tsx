"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useThreeScene } from "./use-three-scene";

export interface OrbSpeaker {
  id: string;
  name: string;
  speaking: boolean;
  severity?: "none" | "low" | "medium" | "high" | "critical";
}

export interface OrbFieldProps {
  speakers: OrbSpeaker[];
  className?: string;
}

const severityColor: Record<string, string> = {
  none: "oklch(0.82 0.18 125)",
  low: "oklch(0.80 0.15 70)",
  medium: "oklch(0.78 0.16 70)",
  high: "oklch(0.70 0.2 35)",
  critical: "oklch(0.66 0.22 25)",
};

/**
 * Voice page hero. Each speaker is a glowing orb; when speaking it rises and
 * its ring radius expands. Warm palette only.
 */
export function OrbField({ speakers, className }: OrbFieldProps) {
  const ref = useRef<HTMLDivElement>(null);
  const speakersRef = useRef(speakers);
  speakersRef.current = speakers;

  useThreeScene(ref, {
    setup: (ctx) => {
      const group = new THREE.Group();
      ctx.scene.add(group);

      const orbMeshes: Record<string, THREE.Mesh> = {};
      const ringMeshes: Record<string, THREE.Mesh> = {};

      const layout = () => {
        const list = speakersRef.current;
        const n = Math.max(list.length, 1);
        list.forEach((sp, i) => {
          const angle = (i / n) * Math.PI * 2;
          const radius = n === 1 ? 0 : 2.6;
          const x = Math.cos(angle) * radius;
          const z = Math.sin(angle) * radius;

          if (!orbMeshes[sp.id]) {
            const geo = new THREE.SphereGeometry(0.5, 32, 32);
            const mat = new THREE.MeshStandardMaterial({
              color: new THREE.Color(severityColor[sp.severity ?? "none"]),
              emissive: new THREE.Color(severityColor[sp.severity ?? "none"]),
              emissiveIntensity: 0.6,
              roughness: 0.4,
              metalness: 0,
            });
            const orb = new THREE.Mesh(geo, mat);
            orb.position.set(x, 0, z);
            group.add(orb);
            orbMeshes[sp.id] = orb;

            const ringGeo = new THREE.TorusGeometry(0.75, 0.03, 16, 64);
            const ringMat = new THREE.MeshBasicMaterial({
              color: new THREE.Color(severityColor[sp.severity ?? "none"]),
              transparent: true,
              opacity: 0.5,
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = Math.PI / 2;
            ring.position.set(x, 0, z);
            group.add(ring);
            ringMeshes[sp.id] = ring;
          } else {
            orbMeshes[sp.id].position.x = x;
            orbMeshes[sp.id].position.z = z;
            ringMeshes[sp.id].position.x = x;
            ringMeshes[sp.id].position.z = z;
          }
        });
        // remove orbs no longer present
        for (const id of Object.keys(orbMeshes)) {
          if (!list.find((s) => s.id === id)) {
            group.remove(orbMeshes[id]);
            (orbMeshes[id].geometry as THREE.BufferGeometry).dispose();
            group.remove(ringMeshes[id]);
            (ringMeshes[id].geometry as THREE.BufferGeometry).dispose();
            delete orbMeshes[id];
            delete ringMeshes[id];
          }
        }
      };
      layout();

      const light = new THREE.PointLight(0xffffff, 1.2, 50);
      light.position.set(0, 4, 6);
      ctx.scene.add(light);
      const amb = new THREE.AmbientLight(0xffffff, 0.4);
      ctx.scene.add(amb);

      (ctx as any)._layout = layout;
      (ctx as any)._orbs = orbMeshes;
      (ctx as any)._rings = ringMeshes;

      return () => {};
    },
    onFrame: (ctx, t) => {
      const layout = (ctx as any)._layout as () => void;
      const orbs = (ctx as any)._orbs as Record<string, THREE.Mesh>;
      const rings = (ctx as any)._rings as Record<string, THREE.Mesh>;
      // relayout in case speaker set changed
      layout();
      for (const sp of speakersRef.current) {
        const orb = orbs[sp.id];
        const ring = rings[sp.id];
        if (!orb || !ring) continue;
        const targetY = sp.speaking
          ? 0.6 + Math.sin(t * 4 + (sp.id.charCodeAt(0) || 1)) * 0.15
          : 0;
        orb.position.y += (targetY - orb.position.y) * 0.1;
        const ringScale = sp.speaking ? 1.25 + Math.sin(t * 5) * 0.1 : 1;
        ring.scale.setScalar(ringScale);
        (ring.material as THREE.MeshBasicMaterial).opacity = sp.speaking
          ? 0.7
          : 0.3;
      }
      ctx.scene.rotation.y = t * 0.08;
    },
  });

  return <div ref={ref} className={className} aria-hidden />;
}
