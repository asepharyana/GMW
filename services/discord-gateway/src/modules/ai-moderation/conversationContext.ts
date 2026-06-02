import { formatModerationTextEvidenceForPrompt } from "./indonesianTextNormalizer.js";
import { formatMediaEvidenceForPrompt } from "../message-capture/messageMetadata.js";
import type { MessageRecord } from "../message-capture/types.js";
import { encoding_for_model as encodingForModel } from "tiktoken";

export interface ConversationContextInput {
  contextBefore: MessageRecord[];
  targets: MessageRecord[];
  maxTokens: number;
}

let _encoder: ReturnType<typeof encodingForModel> | null = null;

function getEncoder(): ReturnType<typeof encodingForModel> {
  if (!_encoder) {
    _encoder = encodingForModel("gpt-4o");
  }
  return _encoder;
}

/**
 * Formats a timestamp to ISO 8601 string
 */
function formatTimestamp(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * Estimates token count for a string (pessimistic approximation for Indonesian slang & JSON overhead)
 */
export function estimateTokens(text: string): number {
  // Use tiktoken for accurate token counting (+15 overhead for JSON structure)
  return getEncoder().encode(text).length + 15;
}

/**
 * Formats a single message for context or target display
 */
export async function formatMessageForPrompt(
  msg: MessageRecord,
  label: "context" | "target",
): Promise<string> {
  const content = msg.edited_content ?? msg.content;
  const timestamp = formatTimestamp(msg.created_at);
  const textEvidence = await formatModerationTextEvidenceForPrompt(content);
  const textSuffix = textEvidence ? ` ${textEvidence}` : "";
  const mediaEvidence = formatMediaEvidenceForPrompt(msg.metadata);
  const mediaSuffix = mediaEvidence ? ` ${mediaEvidence}` : "";
  return `[${label}] id=${msg.id} time=${timestamp} user=${msg.username}: ${content}${textSuffix}${mediaSuffix}`;
}

/**
 * Builds conversation historical context without including targets.
 * Calculates how much token budget targets use, and fills the rest with context.
 */
export async function buildConversationContext(
  input: ConversationContextInput,
): Promise<string[]> {
  const { contextBefore, targets, maxTokens } = input;

  // Calculate tokens used by targets (parallel)
  const targetLines = await Promise.all(
    targets.map((msg) => formatMessageForPrompt(msg, "target")),
  );
  let usedTokens = targetLines.reduce(
    (sum, line) => sum + estimateTokens(line),
    0,
  );

  const contextLines = await Promise.all(
    contextBefore.map((msg) => formatMessageForPrompt(msg, "context")),
  );
  const selectedContextLines: string[] = [];

  // Go backwards through context, taking most recent first
  for (let i = contextLines.length - 1; i >= 0; i--) {
    const line = contextLines[i];
    const lineTokens = estimateTokens(line);

    if (usedTokens + lineTokens <= maxTokens) {
      // Unshift so oldest context is first in the array
      selectedContextLines.unshift(line);
      usedTokens += lineTokens;
    }
  }

  return selectedContextLines;
}
