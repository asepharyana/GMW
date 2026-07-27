import express, { type Router } from "express";
import { validateBody } from "../../shared/middlewares/index.js";
import {
  clearMascotChatHistory,
  getMascotChatHistory,
  handleMascotChat,
} from "./mascot-chat.controller.js";
import { chatRequestSchema } from "./mascot-chat.schema.js";

export function createMascotChatRouter(): Router {
  const router = express.Router();

  router.post(
    "/mascot/chat",
    validateBody(chatRequestSchema),
    handleMascotChat,
  );
  router.get("/mascot/chat/history", getMascotChatHistory);
  router.delete("/mascot/chat/history", clearMascotChatHistory);

  return router;
}
