import express, { type Router } from "express";
import {
  clearMascotChatHistory,
  getMascotChatHistory,
  handleMascotChat,
} from "./mascot-chat.controller.js";

export function createMascotChatRouter(): Router {
  const router = express.Router();

  router.post("/mascot/chat", handleMascotChat);
  router.get("/mascot/chat/history", getMascotChatHistory);
  router.delete("/mascot/chat/history", clearMascotChatHistory);

  return router;
}
