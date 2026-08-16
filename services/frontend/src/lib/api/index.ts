// tRPC client is browser-only (wsLink). Re-export it for convenience / for any
// code that wants to call tRPC directly instead of going through the api/*
// wrappers. Server-side RSC data lives in ./server (httpLink).
export { trpc } from "../trpc/client";
export { chatbotApi } from "./chatbot";
export { configApi } from "./config";
export { dashboardApi } from "./dashboard";
export { mediaApi } from "./media";
export { messagesApi } from "./messages";
export { moderationApi } from "./moderation";
export { recordingsApi } from "./recordings";
export { uiStateApi } from "./ui-state";
export { voiceApi } from "./voice";
