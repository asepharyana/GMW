import express, { type Router } from "express";
import { validateBody } from "../../shared/middlewares/index.js";
import {
  clearChatbotHistory,
  getChatbotHistory,
  handleChatbotChat,
} from "./chatbot.controller.js";
import { chatRequestSchema } from "./chatbot.schema.js";

export function createChatbotRouter(): Router {
  const router = express.Router();

  router.post(
    "/chat",
    validateBody(chatRequestSchema),
    handleChatbotChat,
  );
  router.get("/chat/history", getChatbotHistory);
  router.delete("/chat/history", clearChatbotHistory);

  return router;
}
