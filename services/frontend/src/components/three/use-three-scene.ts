import { useEffect, useRef } from "react";
import * as THREE from "three";

export interface ThreeSceneOptions {
  /** Called once after renderer/scene/camera are created. */
  setup: (ctx: ThreeSceneCtx) => (() => void) | void;
  /** Optional per-frame callback. */
  onFrame?: (ctx: ThreeSceneCtx, t: number) => void;
  background?: string;
}

export interface ThreeSceneCtx {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  container: HTMLDivElement;
  width: number;
  height: number;
}

/**
 * Shared Three.js lifecycle hook:
 *  - capped DPR [1, 1.75], high-performance hint
 *  - RAF loop paused when tab hidden
 *  - resize observer
 *  - full geometry/material/renderer dispose on unmount
 *
 * `setup` may return a cleanup fn (e.g. to remove its own listeners).
 */
export function useThreeScene(
  containerRef: React.RefObject<HTMLDivElement | null>,
  opts: ThreeSceneOptions,
) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let cleanup: (() => void) | void;
    let raf = 0;
    let ctx: ThreeSceneCtx;

    const init = () => {
      const width = container.clientWidth || 1;
      const height = container.clientHeight || 1;

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      renderer.setSize(width, height);
      container.appendChild(renderer.domElement);
      renderer.domElement.style.display = "block";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";

      const scene = new THREE.Scene();
      if (optsRef.current.background) {
        scene.background = new THREE.Color(optsRef.current.background);
      }
      scene.fog = new THREE.FogExp2(0x000000, 0.06);

      const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
      camera.position.set(0, 0, 6);

      ctx = { renderer, scene, camera, container, width, height };
      const c = optsRef.current.setup(ctx);
      if (typeof c === "function") cleanup = c;

      const start = performance.now();
      const loop = () => {
        if (disposed || document.hidden) {
          raf = requestAnimationFrame(loop);
          return;
        }
        const t = (performance.now() - start) / 1000;
        optsRef.current.onFrame?.(ctx, t);
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      const ro = new ResizeObserver(() => {
        const w = container.clientWidth || 1;
        const h = container.clientHeight || 1;
        ctx.width = w;
        ctx.height = h;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      });
      ro.observe(container);

      const onVis = () => {
        /* loop checks document.hidden */
      };
      document.addEventListener("visibilitychange", onVis);

      (ctx as any)._ro = ro;
      (ctx as any)._onVis = onVis;
    };

    init();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (typeof cleanup === "function") cleanup();
      const c = ctx as any;
      if (c?._ro) c._ro.disconnect();
      if (c?._onVis) document.removeEventListener("visibilitychange", c._onVis);
      if (ctx) {
        ctx.scene.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose?.();
          const mat = mesh.material as
            | THREE.Material
            | THREE.Material[]
            | undefined;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose?.();
        });
        ctx.renderer.dispose();
        if (ctx.renderer.domElement.parentNode === container) {
          container.removeChild(ctx.renderer.domElement);
        }
      }
    };
  }, [containerRef]);
}
