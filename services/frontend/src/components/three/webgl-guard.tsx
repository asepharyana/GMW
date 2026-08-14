"use client";

import { type ReactNode, useEffect, useRef } from "react";

export interface WebGLGuardProps {
  children: ReactNode;
  fallback: ReactNode;
}

/**
 * Detects WebGL support. If unavailable (old device / privacy browser /
 * headless without GPU), renders `fallback` instead of the 3D scene so the
 * page is never blank.
 */
export function WebGLGuard({ children, fallback }: WebGLGuardProps) {
  const supported = useRef<boolean | null>(null);

  if (supported.current === null) {
    if (typeof window === "undefined") {
      supported.current = false;
    } else {
      try {
        const canvas = document.createElement("canvas");
        supported.current = !!(
          window.WebGLRenderingContext &&
          (canvas.getContext("webgl2") || canvas.getContext("webgl"))
        );
      } catch {
        supported.current = false;
      }
    }
  }

  return <>{supported.current ? children : fallback}</>;
}
