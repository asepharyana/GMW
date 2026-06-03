import type { Request, Response } from "express";
import { createChildLogger } from "@bete/shared/logger";
import { mascotChatService } from "./mascot-chat.service.js";

const logger = createChildLogger("mascot-chat.controller");

export async function handleMascotChat(req: Request, res: Response) {
  try {
    const { message, context } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "INVALID_INPUT",
        message: "Message is required and must be a string",
      });
    }

    // Get user ID from auth middleware (if available)
    const userId = (req as any).userId || "anonymous";

    logger.debug(
      { userId, messageLength: message.length, context },
      "Received mascot chat message"
    );

    // Process message & generate response
    const response = await mascotChatService.processMessage(message, context, userId);

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
  } catch (error) {
    logger.error({ error }, "Error processing mascot chat");
    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Failed to process mascot chat",
    });
  }
}

export async function getMascotChatHistory(req: Request, res: Response) {
  try {
    const userId = (req as any).userId || "anonymous";
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const history = await mascotChatService.getChatHistory(userId, limit);

    res.status(200).json({
      history,
      total: history.length,
    });
  } catch (error) {
    logger.error({ error }, "Error fetching chat history");
    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch chat history",
    });
  }
}

export async function clearMascotChatHistory(req: Request, res: Response) {
  try {
    const userId = (req as any).userId || "anonymous";

    await mascotChatService.clearChatHistory(userId);

    res.status(200).json({
      message: "Chat history cleared successfully",
    });
  } catch (error) {
    logger.error({ error }, "Error clearing chat history");
    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Failed to clear chat history",
    });
  }
}
