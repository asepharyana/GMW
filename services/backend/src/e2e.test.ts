/**
 * E2E API tests — runs against a running backend instance.
 * Usage: vitest run  (or: API_BASE=http://localhost:3001 vitest run)
 */
import { describe, it, expect } from "vitest";

// Safety: never default to a production URL — forces explicit opt-in
// via: API_BASE=http://localhost:3001/api vitest run
const RAW = process.env.API_BASE;
if (!RAW) {
  throw new Error(
    "API_BASE is not set. Run with: API_BASE=http://localhost:3001/api vitest run",
  );
}
const BASE = RAW;

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = res.status !== 204 ? await res.json().catch(() => null) : null;
  return { status: res.status, body };
}

describe("API Health", () => {
  it("GET /health returns 200 with status=healthy", async () => {
    const { status, body } = await api("/health");
    expect(status).toBe(200);
    expect(body?.status).toBe("healthy");
  });

  it("GET /metrics returns prometheus text", async () => {
    const res = await fetch(`${BASE.replace("/api", "")}/api/metrics`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("nodejs");
  });
});

describe("API Dashboard", () => {
  it("GET /dashboard/stats returns stats fields", async () => {
    const { status, body } = await api("/dashboard/stats");
    expect(status).toBe(200);
    expect(body).toHaveProperty("total_messages");
    expect(body).toHaveProperty("total_flagged");
    expect(body).toHaveProperty("active_users_24h");
    expect(typeof body.total_messages).toBe("number");
  });
});

describe("API Recordings", () => {
  it("GET /recordings returns items with pagination", async () => {
    const { status, body } = await api("/recordings?limit=5");
    expect(status).toBe(200);
    expect(body).toHaveProperty("items");
    expect(Array.isArray(body.items)).toBe(true);
    if (body.items.length > 0) {
      expect(body.items[0]).toHaveProperty("id");
      expect(body.items[0]).toHaveProperty("username");
      expect(body.items[0]).toHaveProperty("created_at");
    }
  });
});

describe("API Config", () => {
  it("GET /config returns 200", async () => {
    const { status } = await api("/config");
    expect(status).toBe(200);
  });
});

describe("API Auth", () => {
  it("POST /auth/login with wrong password returns 401", async () => {
    const { status } = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "wrong" }),
    });
    expect(status).toBe(401);
  });
});

describe("API Voice", () => {
  it("GET /guilds returns 200", async () => {
    const { status } = await api("/guilds");
    expect(status).toBe(200);
  });
});

describe("API Negative", () => {
  it("GET /nonexistent returns 404", async () => {
    const { status } = await api("/nonexistent");
    expect(status).toBe(404);
  });

  it("GET /messages without channelId returns 400", async () => {
    const { status } = await api("/messages?limit=3");
    expect(status).toBe(400);
  });
});
