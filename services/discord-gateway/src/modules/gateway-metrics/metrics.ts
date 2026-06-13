import http from "node:http";
import { createChildLogger } from "@bete/shared/logger";
import { config } from "../../shared/config/config.js";

const logger = createChildLogger("gateway-metrics");

// ─── Metrics Store ───────────────────────────────────────────────────────

interface Metric {
  help: string;
  type: "counter" | "gauge";
  value: number;
  labels?: Record<string, string>;
}

const metrics = new Map<string, Metric>();

// ─── Helpers ─────────────────────────────────────────────────────────────

function key(name: string, labels?: Record<string, string>): string {
  if (!labels) return name;
  const labelStr = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(",");
  return `${name}{${labelStr}}`;
}

// ─── Public API ──────────────────────────────────────────────────────────

export function incrementCounter(
  name: string,
  labels?: Record<string, string>,
): void {
  const k = key(`bete_${name}`, labels);
  const existing = metrics.get(k);
  if (existing) {
    existing.value += 1;
  } else {
    metrics.set(k, {
      help: `Counter: ${name}`,
      type: "counter",
      value: 1,
      labels: labels ? { ...labels } : undefined,
    });
  }
}

export function setGauge(
  name: string,
  value: number,
  labels?: Record<string, string>,
): void {
  const k = key(`bete_${name}`, labels);
  const existing = metrics.get(k);
  if (existing) {
    existing.value = value;
  } else {
    metrics.set(k, {
      help: `Gauge: ${name}`,
      type: "gauge",
      value,
      labels: labels ? { ...labels } : undefined,
    });
  }
}

// ─── HTTP Server ─────────────────────────────────────────────────────────

let server: http.Server | null = null;

function formatMetrics(): string {
  const lines: string[] = [];

  for (const [fullName, metric] of metrics) {
    const baseName = fullName.includes("{") ? fullName.slice(0, fullName.indexOf("{")) : fullName;
    lines.push(`# HELP ${baseName} ${metric.help}`);
    lines.push(`# TYPE ${baseName} ${metric.type}`);
    lines.push(`${fullName} ${metric.value}`);
  }

  return lines.join("\n") + "\n";
}

export function startMetricsServer(): void {
  if (server) return;

  const port = config.METRICS_PORT;
  logger.info({ port }, "Starting metrics HTTP server");

  server = http.createServer((req, res) => {
    if (req.url === "/metrics" || req.url === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(formatMetrics());
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  server.listen(port, () => {
    logger.info({ port }, "Metrics server listening");
  });

  server.on("error", (err) => {
    logger.error({ error: err.message }, "Metrics server error");
  });
}

export function stopMetricsServer(): void {
  if (!server) return;
  server.close();
  server = null;
  logger.info("Metrics server stopped");
}
