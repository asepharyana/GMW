"use client";

import { useEffect, useRef } from "react";
import { useMascot } from "./mascot-context";

/**
 * Live2D Cubism WebGL canvas.
 *
 * This component renders the Live2D model via the Cubism SDK.
 * Integration requires:
 *   1. Live2D Cubism SDK for Web (npm: @live2d/cubism)
 *   2. Model files: .model3.json, .moc3, .physics3.json, textures
 *   3. Place model files in public/mascot/
 *
 * The current implementation shows a placeholder character.
 * Replace with actual Cubism SDK integration when model files are available.
 */

export function MascotCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { expression } = useMascot();

  // Placeholder: draw a simple avatar face that responds to expression
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Background circle
    const gradient = ctx.createRadialGradient(w / 2, h / 2 - 10, 10, w / 2, h / 2, 80);
    gradient.addColorStop(0, "oklch(0.62 0.17 215 / 0.8)");
    gradient.addColorStop(0.6, "oklch(0.12 0.02 245 / 0.9)");
    gradient.addColorStop(1, "oklch(0.07 0.015 250 / 1)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 75, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    const eyeOffsetX = 20;
    const eyeY = 45;

    // Expression-driven eyes
    if (expression === "surprise") {
      // Wide eyes
      ctx.fillStyle = "oklch(0.93 0.01 245)";
      ctx.beginPath();
      ctx.ellipse(w / 2 - eyeOffsetX, eyeY, 12, 14, 0, 0, Math.PI * 2);
      ctx.ellipse(w / 2 + eyeOffsetX, eyeY, 12, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "oklch(0.62 0.17 215)";
      ctx.beginPath();
      ctx.arc(w / 2 - eyeOffsetX, eyeY, 5, 0, Math.PI * 2);
      ctx.arc(w / 2 + eyeOffsetX, eyeY, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (expression === "happy") {
      // Happy closed crescent eyes
      ctx.strokeStyle = "oklch(0.93 0.01 245)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(w / 2 - eyeOffsetX, eyeY, 10, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w / 2 + eyeOffsetX, eyeY, 10, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
    } else if (expression === "sad") {
      // Sad downcast eyes
      ctx.fillStyle = "oklch(0.93 0.01 245)";
      ctx.beginPath();
      ctx.ellipse(w / 2 - eyeOffsetX, eyeY, 8, 6, 0.2, 0, Math.PI * 2);
      ctx.ellipse(w / 2 + eyeOffsetX, eyeY, 8, 6, -0.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Normal eyes
      ctx.fillStyle = "oklch(0.93 0.01 245)";
      ctx.beginPath();
      ctx.ellipse(w / 2 - eyeOffsetX, eyeY, 10, 8, 0, 0, Math.PI * 2);
      ctx.ellipse(w / 2 + eyeOffsetX, eyeY, 10, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "oklch(0.62 0.17 215)";
      ctx.beginPath();
      ctx.arc(w / 2 - eyeOffsetX, eyeY, 4, 0, Math.PI * 2);
      ctx.arc(w / 2 + eyeOffsetX, eyeY, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mouth
    ctx.strokeStyle = "oklch(0.93 0.01 245 / 0.7)";
    ctx.lineWidth = 2;
    if (expression === "talking") {
      ctx.beginPath();
      ctx.ellipse(w / 2, 70, 8, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (expression === "happy") {
      ctx.beginPath();
      ctx.arc(w / 2, 70, 10, 0.1, Math.PI - 0.1);
      ctx.stroke();
    } else if (expression === "surprise") {
      ctx.beginPath();
      ctx.ellipse(w / 2, 70, 6, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "oklch(0.12 0.02 245)";
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(w / 2, 75, 6, 0.1, Math.PI - 0.1);
      ctx.stroke();
    }
  }, [expression]);

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={180}
      className="w-full h-full"
    />
  );
}
