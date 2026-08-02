import type { Request, Response } from "express";
import { createChildLogger } from "@/shared/logger/index";
import { asyncHandler } from "../../shared/middlewares/index.js";
import { chatbotService } from "./chatbot.service.js";

const logger = createChildLogger("chatbot.controller");

interface AuthenticatedRequest extends Request {
  userId?: string;
}

/**
 * Resolve the actor id for a request. Frontend (no-login) sends a per-device
 * UUID via X-User-Id so chat history stays isolated per visitor; a registered
 * auth middleware userId takes precedence when present.
 */
function resolveUserId(req: Request): string {
  const authId = (req as AuthenticatedRequest).userId;
  if (authId) return authId;
  const header = (req.headers["x-user-id"] as string | undefined)?.trim();
  return header || "anonymous";
}

export const handleChatbotChat = asyncHandler(
  async (req: Request, res: Response) => {
    const { message, context } = req.body as {
      message: string;
      context?: Record<string, unknown>;
    };

    // Validate required fields
    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "INVALID_INPUT",
        message: "Message is required and must be a string",
      });
    }

    // Get user ID from X-User-Id header (no-login device uuid) or auth
    const userId = resolveUserId(req);

    logger.debug(
      { userId, messageLength: message.length, context },
      "Received chatbot chat message",
    );

    // Process message & generate response
    const response = await chatbotService.processMessage(
      message,
      context,
      userId,
    );

    // Save conversation to database
    await chatbotService.saveConversation({
      userId,
      userMessage: message,
      botResponse: response,
      context,
      timestamp: new Date(),
    });

    logger.info({ userId }, "Chatbot chat processed successfully");

    res.status(200).json({
      response,
      timestamp: new Date().toISOString(),
    });
  },
);

export const getChatbotHistory = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = resolveUserId(req);
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);

    const history = await chatbotService.getChatHistory(userId, limit);

    res.status(200).json({
      history,
      total: history.length,
    });
  },
);

export const clearChatbotHistory = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = resolveUserId(req);

    await chatbotService.clearChatHistory(userId);

    res.status(200).json({
      message: "Chat history cleared successfully",
    });
  },
);
