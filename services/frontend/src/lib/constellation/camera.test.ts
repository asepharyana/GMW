import { describe, expect, test } from "bun:test";
import { fitCamera, flyTo } from "./camera";

describe("flyTo", () => {
  const from = { x: 0, y: 0, z: 1 };
  const to = { x: 100, y: -50, z: 2 };

  test("t=0 returns origin", () => {
    expect(flyTo(from, to, 0)).toEqual({ x: 0, y: 0, z: 1 });
  });

  test("t=1 arrives exactly", () => {
    expect(flyTo(from, to, 1)).toEqual(to);
  });

  test("monotonic progress", () => {
    let prev = -Infinity;
    for (let i = 0; i <= 20; i++) {
      const s = flyTo(from, to, i / 20);
      expect(s.x).toBeGreaterThan(prev);
      prev = s.x;
    }
  });

  test("clamps out-of-range t", () => {
    expect(flyTo(from, to, -3)).toEqual(from);
    expect(flyTo(from, to, 7)).toEqual(to);
  });
});

describe("fitCamera", () => {
  test("empty scene centers", () => {
    const c = fitCamera([], 800, 600);
    expect(c.x).toBe(400);
    expect(c.y).toBe(300);
  });

  test("zooms to fit nodes with padding", () => {
    const nodes = [
      { x: 100, y: 100, r: 10 },
      { x: 500, y: 400, r: 10 },
    ];
    const c = fitCamera(nodes, 800, 600);
    expect(c.x).toBe(300);
    expect(c.y).toBe(250);
    expect(c.z).toBeGreaterThan(0);
    expect(c.z).toBeLessThanOrEqual(3);
  });
});
