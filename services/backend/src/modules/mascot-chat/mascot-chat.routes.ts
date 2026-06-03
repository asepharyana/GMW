import express, { type Router } from "express";
import { asyncHandler } from "../../shared/middlewares/index.js";
import {
  clearMascotChatHistory,
  getMascotChatHistory,
  handleMascotChat,
} from "./mascot-chat.controller.js";

export function createMascotChatRouter(): Router {
  const router = express.Router();

  router.post("/mascot/chat", asyncHandler(handleMascotChat));
  router.get("/mascot/chat/history", asyncHandler(getMascotChatHistory));
  router.delete("/mascot/chat/history", asyncHandler(clearMascotChatHistory));

  return router;
}
