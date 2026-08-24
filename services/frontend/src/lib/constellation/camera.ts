/**
 * Camera math for constellation fly-to — pure, easing-based interpolation.
 */
export interface CameraState {
  /** Camera center in canvas space. */
  x: number;
  y: number;
  /** Zoom factor (1 = fit). */
  z: number;
}

export type Easing = (t: number) => number;

/** Smooth ease-in-out cubic. Monotonic on [0,1]. */
export const easeInOutCubic: Easing = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

export function flyTo(
  from: CameraState,
  to: CameraState,
  t: number,
  ease: Easing = easeInOutCubic,
): CameraState {
  const clamped = Math.max(0, Math.min(1, t));
  const k = ease(clamped);
  return {
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k,
    z: from.z + (to.z - from.z) * k,
  };
}

/** Fit-to-view camera so a scene always starts framed. */
export function fitCamera(
  nodes: { x: number; y: number; r?: number }[],
  width: number,
  height: number,
  padding = 80,
): CameraState {
  if (nodes.length === 0 || width <= 0 || height <= 0) {
    return { x: width / 2, y: height / 2, z: 1 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const r = n.r ?? 8;
    minX = Math.min(minX, n.x - r);
    maxX = Math.max(maxX, n.x + r);
    minY = Math.min(minY, n.y - r);
    maxY = Math.max(maxY, n.y + r);
  }
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const z = Math.min(
    3,
    Math.max(
      0.35,
      Math.min((width - padding * 2) / w, (height - padding * 2) / h),
    ),
  );
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    z,
  };
}
