"use client";

/**
 * ConstellationStage — full-bleed interactive star-field renderer.
 * Renders the route's graph as glowing nodes + hairline edges over a
 * three.js orthographic view. Pan = drag, zoom = wheel/pinch, click on
 * an href-bearing node navigates (plain location.assign — router.push
 * can no-op under standalone+trailingSlash builds).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { type CameraState, fitCamera } from "@/lib/constellation/camera";
import type { ConstellationGraph } from "@/lib/constellation/graph";
import { computeLayout, type LayoutNode } from "@/lib/constellation/layout";
import { readPalette, type StagePalette } from "@/lib/constellation/palette";

export interface ConstellationStageProps {
  graph: ConstellationGraph;
  seed?: number;
  /** Node id kept highlighted (scene selection). */
  selectedId?: string | null;
  onNodeClick?: (nodeId: string) => void;
}

const Z_MIN = 0.35;
const Z_MAX = 3;

export function ConstellationStage({
  graph,
  seed = 42,
  selectedId = null,
  onNodeClick,
}: ConstellationStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const labelsRef = useRef<HTMLDivElement | null>(null);
  const camRef = useRef<CameraState>({ x: 0, y: 0, z: 1 });
  const layoutRef = useRef<LayoutNode[]>([]);
  const nodeByIdRef = useRef(new Map(graph.nodes.map((n) => [n.id, n])));
  const [size, setSize] = useState({ w: 0, h: 0 });
  const hoveredRef = useRef<string | null>(null);
  const [reduced, setReduced] = useState(false);

  nodeByIdRef.current = new Map(graph.nodes.map((n) => [n.id, n]));

  // Viewport size + reduced-motion preference.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    const measure = () =>
      setSize({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Deterministic layout whenever graph or viewport changes.
  useEffect(() => {
    if (size.w < 50 || size.h < 50) return;
    const layout = computeLayout(graph.nodes, graph.edges, {
      width: size.w,
      height: size.h,
      seed,
      reduced,
    });
    layoutRef.current = layout;
    camRef.current = fitCamera(layout, size.w, size.h);
  }, [graph, size.w, size.h, seed, reduced]);

  // Build + run the renderer.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w < 50 || size.h < 50 || layoutRef.current.length === 0)
      return;

    let palette: StagePalette = readPalette();
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(size.w, size.h, false);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 200);

    const group = new THREE.Group();
    scene.add(group);
    const disposables: { dispose: () => void }[] = [];
    const track = <T extends { dispose: () => void }>(d: T): T => {
      disposables.push(d);
      return d;
    };

    // Edges first (under nodes).
    const byId = new Map(layoutRef.current.map((n) => [n.id, n]));
    const edgeMat = track(
      new THREE.LineBasicMaterial({
        color: palette.inkFaint,
        transparent: true,
        opacity: 0.35,
      }),
    );
    for (const e of graph.edges) {
      const a = byId.get(e.source);
      const b = byId.get(e.target);
      if (!a || !b) continue;
      const geo = track(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(a.x, a.y, 0),
          new THREE.Vector3(b.x, b.y, 0),
        ]),
      );
      group.add(new THREE.Line(geo, edgeMat));
    }

    // Nodes: glow halo + core disc.
    interface NodeVisual {
      id: string;
      halo: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
      core: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
      r: number;
      x: number;
      y: number;
    }
    const visuals: NodeVisual[] = [];
    for (const n of layoutRef.current) {
      const meta = nodeByIdRef.current.get(n.id);
      const kind = meta?.kind ?? "message";
      const flagged =
        Number(meta?.meta?.flagged_count ?? 0) > 0 && kind === "channel";
      const color =
        kind === "guild"
          ? palette.signal
          : flagged
            ? palette.vermilion
            : palette.ink;
      const haloGeo = track(new THREE.CircleGeometry(n.r * 2.4, 32));
      const haloMat = track(
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: kind === "guild" ? 0.14 : 0.08,
        }),
      );
      const coreGeo = track(new THREE.CircleGeometry(n.r, 32));
      const coreMat = track(
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.92,
        }),
      );
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.set(n.x, n.y, -1);
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.set(n.x, n.y, 0);
      group.add(halo, core);
      visuals.push({ id: n.id, halo, core, r: n.r, x: n.x, y: n.y });
    }

    const applyCamera = () => {
      const { x, y, z } = camRef.current;
      const hw = size.w / (2 * z);
      const hh = size.h / (2 * z);
      camera.left = -hw;
      camera.right = hw;
      camera.top = hh;
      camera.bottom = -hh;
      camera.position.set(x, y, 100);
      camera.updateProjectionMatrix();
    };

    // --- interaction state ---
    type PointerMode =
      | { t: "idle" }
      | { t: "drag"; sx: number; sy: number; cx: number; cy: number };
    let mode: PointerMode = { t: "idle" };
    let raf = 0;
    let disposed = false;

    const pointerToWorld = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const { x, y, z } = camRef.current;
      return {
        wx: x + (clientX - rect.left - size.w / 2) / z,
        wy: y - (clientY - rect.top - size.h / 2) / z,
      };
    };

    const pickNode = (clientX: number, clientY: number): NodeVisual | null => {
      const { wx, wy } = pointerToWorld(clientX, clientY);
      let best: NodeVisual | null = null;
      let bestD = Infinity;
      for (const v of visuals) {
        const d = Math.hypot(wx - v.x, wy - v.y);
        if (d <= v.r + 6 && d < bestD) {
          best = v;
          bestD = d;
        }
      }
      return best;
    };

    const onPointerDown = (ev: PointerEvent) => {
      mode = {
        t: "drag",
        sx: ev.clientX,
        sy: ev.clientY,
        cx: camRef.current.x,
        cy: camRef.current.y,
      };
      canvas.style.cursor = "grabbing";
    };
    const onPointerMove = (ev: PointerEvent) => {
      if (mode.t === "drag") {
        const z = camRef.current.z;
        camRef.current.x = mode.cx - (ev.clientX - mode.sx) / z;
        camRef.current.y = mode.cy + (ev.clientY - mode.sy) / z;
        return;
      }
      const hit = pickNode(ev.clientX, ev.clientY);
      hoveredRef.current = hit ? hit.id : null;
      canvas.style.cursor = hit ? "pointer" : "grab";
    };
    const onPointerUp = (ev: PointerEvent) => {
      const wasDrag =
        mode.t === "drag" &&
        Math.hypot(ev.clientX - mode.sx, ev.clientY - mode.sy) > 4;
      mode = { t: "idle" };
      canvas.style.cursor = "grab";
      if (wasDrag) return;
      const hit = pickNode(ev.clientX, ev.clientY);
      if (!hit) return;
      const meta = nodeByIdRef.current.get(hit.id);
      onNodeClick?.(hit.id);
      if (meta?.href) window.location.assign(meta.href);
    };
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const old = camRef.current.z;
      const next = Math.max(
        Z_MIN,
        Math.min(Z_MAX, old * Math.exp(-ev.deltaY * 0.0012)),
      );
      camRef.current.z = next;
    };

    canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // Labels (HTML, imperative transforms — cheap for ≤16 nodes).
    const labelHost = labelsRef.current;
    const labelEls = new Map<string, HTMLSpanElement>();
    const labeled = [...layoutRef.current]
      .sort((a, b) => b.r - a.r)
      .slice(0, 14);
    if (labelHost) {
      for (const n of labeled) {
        const el = document.createElement("span");
        el.textContent = nodeByIdRef.current.get(n.id)?.label ?? n.id;
        el.dataset.nodeLabel = n.id;
        el.className =
          "pointer-events-none absolute whitespace-nowrap font-mono text-[11px] tracking-wide text-[var(--color-ink-soft)] transition-colors";
        labelHost.appendChild(el);
        labelEls.set(n.id, el);
      }
    }

    // Theme sync — tokens flip with the .light class.
    const themeObserver = new MutationObserver(() => {
      palette = readPalette();
      for (const v of visuals) {
        const meta = nodeByIdRef.current.get(v.id);
        const flagged =
          Number(meta?.meta?.flagged_count ?? 0) > 0 &&
          (meta?.kind ?? "") === "channel";
        const c =
          meta?.kind === "guild"
            ? palette.signal
            : flagged
              ? palette.vermilion
              : palette.ink;
        v.core.material.color.setHex(c);
        v.halo.material.color.setHex(c);
      }
      edgeMat.color.setHex(palette.inkFaint);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    let hidden = document.hidden;
    const onVis = () => {
      hidden = document.hidden;
    };
    document.addEventListener("visibilitychange", onVis);

    const start = performance.now();
    const frame = (now: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      if (hidden) return;
      applyCamera();

      // Gentle breathing glow (visual only — hit positions stay baked).
      const t = (now - start) / 1000;
      let i = 0;
      for (const v of visuals) {
        if (!reduced) {
          const pulse = 0.5 + 0.5 * Math.sin(t * 1.4 + i * 0.7);
          v.halo.material.opacity =
            (v.id === "guild" ? 0.14 : 0.08) * (0.7 + 0.6 * pulse);
        }
        const hov = v.id === hoveredRef.current || v.id === selectedId;
        v.core.scale.setScalar(hov ? 1.25 : 1);
        i += 1;
      }

      renderer.render(scene, camera);

      if (labelHost) {
        const { x, y, z } = camRef.current;
        for (const [id, el] of labelEls) {
          const v = visuals.find((s) => s.id === id);
          if (!v) continue;
          const sx = (v.x - x) * z + size.w / 2;
          const sy = -(v.y - y) * z + size.h / 2 + v.r + 14;
          el.style.transform = `translate(${sx}px, ${sy}px) translateX(-50%)`;
          el.style.color =
            id === hoveredRef.current || id === selectedId
              ? "var(--color-signal)"
              : "var(--color-ink-soft)";
        }
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      themeObserver.disconnect();
      for (const el of labelEls.values()) el.remove();
      for (const d of disposables) d.dispose();
      scene.clear();
      renderer.dispose();
    };
  }, [graph, size.w, size.h, reduced, selectedId, onNodeClick]);

  const emptyGraph = graph.nodes.length === 0;
  const hint = useMemo(
    () => (emptyGraph ? "Menunggu data scene…" : null),
    [emptyGraph],
  );

  const handleReset = useCallback(() => {
    if (layoutRef.current.length > 0 && size.w > 0) {
      camRef.current = fitCamera(layoutRef.current, size.w, size.h);
    }
  }, [size.w, size.h]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 -z-10 h-full w-full touch-none select-none"
      />
      <div ref={labelsRef} aria-hidden="true" className="fixed inset-0 -z-10" />
      {hint ? (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-mono text-sm text-[var(--color-ink-faint)]">
          {hint}
        </p>
      ) : null}
      <button
        className="absolute bottom-24 right-5 rounded-full border border-[var(--color-hairline)] bg-[var(--color-canvas-2)]/60 px-3 py-1 font-mono text-xs text-[var(--color-ink-soft)] backdrop-blur-sm hover:text-[var(--color-ink)] md:bottom-20"
        onClick={handleReset}
        type="button"
      >
        reset view
      </button>
    </>
  );
}
