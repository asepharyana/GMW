"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useThreeScene } from "./use-three-scene";

export interface SignalFieldProps {
  /** 0..1 — scales particle pulse speed + opacity */
  activity?: number;
  className?: string;
}

/**
 * Dashboard hero. A particle field whose idle rotation + breathing pulse
 * reflects live activity. Warm signal-lime palette, additive glow, no harsh
 * white. Pointer parallax via camera lerp.
 */
export function SignalField({ activity = 0.4, className }: SignalFieldProps) {
  const ref = useRef<HTMLDivElement>(null);
  const activityRef = useRef(activity);
  activityRef.current = activity;

  useThreeScene(ref, {
    setup: (ctx) => {
      const w = ctx.width;
      const h = ctx.height;
      const area = w * h;
      const count = Math.min(900, Math.max(220, Math.floor(area / 2000)));

      const positions = new Float32Array(count * 3);
      const phases = new Float32Array(count);
      const radius = 4.2;
      for (let i = 0; i < count; i++) {
        const r = radius * (0.25 + Math.random() * 0.75);
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6;
        positions[i * 3 + 2] = r * Math.cos(phi);
        phases[i] = Math.random() * Math.PI * 2;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

      const mat = new THREE.PointsMaterial({
        color: new THREE.Color("oklch(0.82 0.18 125)"),
        size: 0.045,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const points = new THREE.Points(geo, mat);
      ctx.scene.add(points);

      const key = { x: 0, y: 0 };
      const onMove = (e: PointerEvent) => {
        const rect = ctx.container.getBoundingClientRect();
        key.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
        key.y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      };
      ctx.container.addEventListener("pointermove", onMove);

      (ctx as any)._key = key;
      (ctx as any)._points = points;
      (ctx as any)._phases = phases;

      return () => {
        ctx.container.removeEventListener("pointermove", onMove);
      };
    },
    onFrame: (ctx, t) => {
      const points = (ctx as any)._points as THREE.Points;
      const key = (ctx as any)._key as { x: number; y: number };
      const phases = (ctx as any)._phases as Float32Array;
      const act = activityRef.current;
      const pulse = 1 + Math.sin(t * (1.2 + act * 2.2)) * 0.08 * (0.5 + act);
      points.scale.setScalar(pulse);
      points.rotation.y = t * (0.05 + act * 0.12);
      points.rotation.x = Math.sin(t * 0.2) * 0.1;
      // parallax
      ctx.camera.position.x += (key.x * 1.4 - ctx.camera.position.x) * 0.04;
      ctx.camera.position.y += (-key.y * 1.0 - ctx.camera.position.y) * 0.04;
      ctx.camera.lookAt(0, 0, 0);
    },
  });

  return <div ref={ref} className={className} aria-hidden />;
}
