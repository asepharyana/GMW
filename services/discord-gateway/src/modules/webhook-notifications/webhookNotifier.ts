import { createChildLogger } from "@bete/shared/logger";
import type { AppConfig as GatewayConfig } from "../../shared/config/config.js";
import { config } from "../../shared/config/config.js";

const logger = createChildLogger("webhook-notifier");

// ─── Types ───────────────────────────────────────────────────────────────

export interface WebhookPayload {
  event: string;
  timestamp: number;
  guild_id?: string | null;
  channel_id?: string | null;
  message_id?: string | null;
  user_id?: string | null;
  username?: string | null;
  severity?: string | null;
  flags?: string[] | null;
  content?: string | null;
  details?: Record<string, unknown>;
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Fire a webhook notification to all configured URLs.
 * Fire-and-forget: errors are logged, never thrown.
 */
export async function triggerWebhook(
  eventType: string,
  payload: WebhookPayload,
): Promise<void> {
  const urls = (config as any).WEBHOOK_URLS as string[] | undefined;
  if (!urls || urls.length === 0) return;

  const enabledEvents = (config as any).WEBHOOK_EVENTS as string[] | undefined;
  if (
    enabledEvents &&
    enabledEvents.length > 0 &&
    !enabledEvents.includes(eventType)
  )
    return;

  const body = JSON.stringify({
    ...payload,
    event: eventType,
    timestamp: Date.now(),
    source: "discord-gateway",
  });

  const results = await Promise.allSettled(
    urls.map((url) => sendWebhook(url, body)),
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "rejected") {
      logger.warn(
        { url: urls[i], eventType, error: String(result.reason) },
        "Webhook delivery failed",
      );
    }
  }
}

// ─── Internal ────────────────────────────────────────────────────────────

async function sendWebhook(
  url: string | undefined,
  body: string,
): Promise<void> {
  if (!url) return;
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Webhook responded with status ${response.status}`);
      }

      logger.debug({ url }, "Webhook delivered");
      return;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < 2) {
        // Brief backoff before retry
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  throw lastErr ?? new Error("Webhook send failed after retries");
}
