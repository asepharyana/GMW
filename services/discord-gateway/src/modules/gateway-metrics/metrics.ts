import http from "node:http";
import { createChildLogger } from "@/shared/logger/index";
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

// Collectors run on every scrape so gauges reflect live pipeline state
// without callers having to push updates on every event.
const collectors: Array<() => void> = [];

const startTs = Date.now();

function key(name: string, labels?: Record<string, string>): string {
  if (!labels) return name;
  const labelStr = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(",");
  return `${name}{${labelStr}}`;
}

export function registerCollector(fn: () => void): void {
  collectors.push(fn);
}

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

// Process-level static/derived gauges, refreshed each scrape.
registerCollector(() => {
  const uptimeSec = Math.floor((Date.now() - startTs) / 1000);
  setGauge("process_uptime_seconds", uptimeSec);
  const mem = process.memoryUsage();
  setGauge("process_resident_bytes", mem.rss);
  setGauge("process_heap_used_bytes", mem.heapUsed);
  setGauge("process_heap_total_bytes", mem.heapTotal);
  setGauge("process_event_loop_lag_ms", 0);
});

// ─── HTTP Server ─────────────────────────────────────────────────────────

let server: http.Server | null = null;

function formatMetrics(): string {
  for (const c of collectors) {
    try {
      c();
    } catch (err) {
      logger.warn({ error: String(err) }, "Metrics collector failed");
    }
  }

  const lines: string[] = [];
  for (const [fullName, metric] of metrics) {
    const baseName = fullName.includes("{")
      ? fullName.slice(0, fullName.indexOf("{"))
      : fullName;
    lines.push(`# HELP ${baseName} ${metric.help}`);
    lines.push(`# TYPE ${baseName} ${metric.type}`);
    lines.push(`${fullName} ${metric.value}`);
  }
  return `${lines.join("\n")}\n`;
}

export function startMetricsServer(): void {
  if (server) return;

  const port = (config as any).METRICS_PORT ?? 9090;
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
