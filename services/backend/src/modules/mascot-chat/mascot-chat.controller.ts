import { createChildLogger } from "@bete/shared/logger";
import type { Request, Response } from "express";
import { asyncHandler } from "../../shared/middlewares/index.js";
import { mascotChatService } from "./mascot-chat.service.js";

const logger = createChildLogger("mascot-chat.controller");

interface AuthenticatedRequest extends Request {
  userId?: string;
}

export const handleMascotChat = asyncHandler(
  async (req: Request, res: Response) => {
    const { message, context } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "INVALID_INPUT",
        message: "Message is required and must be a string",
      });
    }

    // Get user ID from auth middleware (if available)
    const userId = (req as AuthenticatedRequest).userId || "anonymous";

    logger.debug(
      { userId, messageLength: message.length, context },
      "Received mascot chat message",
    );

    // Process message & generate response
    const response = await mascotChatService.processMessage(
      message,
      context,
      userId,
    );

    // Save conversation to database
    await mascotChatService.saveConversation({
      userId,
      userMessage: message,
      mascotResponse: response,
      context,
      timestamp: new Date(),
    });

    logger.info({ userId }, "Mascot chat processed successfully");

    res.status(200).json({
      response,
      timestamp: new Date().toISOString(),
    });
  },
);

export const getMascotChatHistory = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).userId || "anonymous";
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const history = await mascotChatService.getChatHistory(userId, limit);

    res.status(200).json({
      history,
      total: history.length,
    });
  },
);

export const clearMascotChatHistory = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).userId || "anonymous";

    await mascotChatService.clearChatHistory(userId);

    res.status(200).json({
      message: "Chat history cleared successfully",
    });
  },
);
