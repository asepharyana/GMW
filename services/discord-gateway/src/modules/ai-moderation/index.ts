export { startPendingAIAnalysisWorker } from "./aiAnalyzer.js";
export { runModerationAnalysis } from "./moderationOrchestrator.js";
export { buildSystemPrompt } from "./moderationPrompt.js";
export { runSimpleTextFallback } from "./simpleFallback.js";

// ── New two-pass pipeline exports ──────────────────────────────────────────
export { classifyMessage } from "./fastClassifier.js";
export type { Layer1Result } from "./fastClassifier.js";
export type { AnalysisInput, AnalysisResult, WorkerConfig, MessageBatch } from "./ai-analysis-worker.js";