import { describe, expect, test } from "bun:test";
import { cssColorToHexInt, oklchToHexInt } from "./palette";

describe("oklchToHexInt", () => {
  test("white", () => {
    expect(oklchToHexInt(1, 0, 0)).toBe(0xffffff);
  });
  test("black", () => {
    expect(oklchToHexInt(0, 0, 0)).toBe(0x000000);
  });
  test("green-ish signal stays recognizable", () => {
    const hex = oklchToHexInt(0.86, 0.19, 128);
    expect(hex).not.toBeNull();
    if (hex === null) throw new Error("hex is null");
    const r = (hex >> 16) & 0xff;
    const g = (hex >> 8) & 0xff;
    expect(g).toBeGreaterThan(r);
  });
  test("invalid input returns null", () => {
    expect(oklchToHexInt(Number.NaN, 0, 0)).toBeNull();
  });
});

describe("cssColorToHexInt", () => {
  test("parses oklch()", () => {
    expect(cssColorToHexInt("oklch(1 0 0)")).toBe(0xffffff);
  });
  test("parses rgb()", () => {
    expect(cssColorToHexInt("rgb(255, 0, 0)")).toBe(0xff0000);
  });
  test("parses hex", () => {
    expect(cssColorToHexInt("#ff8000")).toBe(0xff8000);
  });
  test("garbage returns null", () => {
    expect(cssColorToHexInt("nonsense")).toBeNull();
  });
});
