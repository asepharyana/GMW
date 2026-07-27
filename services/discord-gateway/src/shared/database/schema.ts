// ---------------------------------------------------------------------------
// Database Schema — barrel re-export
//
// All table definitions have been split into domain files under schema/.
// This barrel preserves backward compatibility for existing imports.
// New code can import from the specific domain file (e.g., schema/messages.js).
// ---------------------------------------------------------------------------

export * from "./schema/analytics.js";
export * from "./schema/cache.js";
export * from "./schema/messages.js";
export * from "./schema/meta.js";
export * from "./schema/voice.js";
