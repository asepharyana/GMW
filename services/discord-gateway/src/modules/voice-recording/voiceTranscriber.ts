// ─── Voice Transcription — AI-powered speech-to-text for voice recordings ────

import { createReadStream } from "node:fs";
import OpenAI from "openai";
import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../shared/config/config.js";

const logger = createChildLogger("voice-transcriber");

/**
 * Transcribe a voice recording OGG file using OpenAI Whisper API.
 * Returns the transcribed text or null on failure.
 */
export async function transcribeRecording(
  oggPath: string,
): Promise<string | null> {
  if (!config.AI_VOICE_TRANSCRIPTION_ENABLED) return null;
  if (!config.AI_LLM_API_KEY) {
    logger.warn("AI_LLM_API_KEY not set, skipping transcription");
    return null;
  }

  try {
    const openai = new OpenAI({
      apiKey: config.AI_LLM_API_KEY,
      baseURL: config.AI_LLM_BASE_URL,
      maxRetries: 2,
      timeout: 120_000,
    });

    const response = await openai.audio.transcriptions.create({
      file: createReadStream(oggPath),
      model: "whisper-1",
      language: "en",
      response_format: "text",
    });

    const text = typeof response === "string" ? response.trim() : null;
    if (!text) {
      logger.warn({ oggPath }, "Empty transcription result");
      return null;
    }

    logger.info({ oggPath, length: text.length }, "Transcription completed");
    return text;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ oggPath, error: msg }, "Transcription failed");
    return null;
  }
}
