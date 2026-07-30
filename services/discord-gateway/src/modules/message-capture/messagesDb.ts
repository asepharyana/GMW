import { createChildLogger, type Logger } from "@/shared/logger/index";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../../shared/database/schema.js";
import type {
  MessageQuery,
  MessageRecord,
  PageResult,
} from "../message-capture/types.js";
import type { AIAnalysisUpdate } from "./messagesAnalysis.js";
import { MessagesAnalysis } from "./messagesAnalysis.js";
import { MessagesCleanup } from "./messagesCleanup.js";
import { MessagesCrud } from "./messagesCrud.js";
import { MessagesPagination } from "./messagesPagination.js";
import { MessagesSearch } from "./messagesSearch.js";

// Re-export AIAnalysisUpdate for consumers (messageStore.ts imports it)
export type { AIAnalysisUpdate } from "./messagesAnalysis.js";

// ─── MessagesDb Facade ────────────────────────────────────────────────────────
// Thin facade that delegates to domain-specific sub-modules.

export class MessagesDb {
  private crud: MessagesCrud;
  private analysis: MessagesAnalysis;
  private search: MessagesSearch;
  private pagination: MessagesPagination;
  private cleanup: MessagesCleanup;

  constructor(db: NodePgDatabase<typeof schema>, _parentLogger?: Logger) {
    const logger = _parentLogger ?? createChildLogger("messages-db");
    this.crud = new MessagesCrud(db, logger);
    this.analysis = new MessagesAnalysis(db, logger);
    this.search = new MessagesSearch(db, logger);
    this.pagination = new MessagesPagination(db, logger);
    this.cleanup = new MessagesCleanup(db, logger);
  }

  // ── CRUD ────────────────────────────────────────────────────────────────

  insertMessage(message: MessageRecord): Promise<void> {
    return this.crud.insertMessage(message);
  }

  upsertMessageForCapture(message: MessageRecord): Promise<boolean> {
    return this.crud.upsertMessageForCapture(message);
  }

  updateMessageAsEdited(
    messageId: string,
    editedContent: string,
    editedAt: number,
  ): Promise<void> {
    return this.crud.updateMessageAsEdited(messageId, editedContent, editedAt);
  }

  updateMessageAsDeleted(messageId: string, deletedAt: number): Promise<void> {
    return this.crud.updateMessageAsDeleted(messageId, deletedAt);
  }

  getMessagesByChannel(
    channelId: string,
    limit?: number,
    offset?: number,
    guildId?: string,
  ): Promise<MessageRecord[]> {
    return this.crud.getMessagesByChannel(channelId, limit, offset, guildId);
  }

  getMessageById(messageId: string): Promise<MessageRecord | null> {
    return this.crud.getMessageById(messageId);
  }

  // ── AI Analysis ─────────────────────────────────────────────────────────

  updateMessageAIAnalysis(
    messageId: string,
    result: AIAnalysisUpdate,
  ): Promise<MessageRecord | null> {
    return this.analysis.updateMessageAIAnalysis(messageId, result);
  }

  updateMessagesAIAnalysisBulk(
    updates: Array<{ messageId: string; result: AIAnalysisUpdate }>,
  ): Promise<MessageRecord[]> {
    return this.analysis.updateMessagesAIAnalysisBulk(updates);
  }

  getPendingAIAnalysisMessages(limit?: number): Promise<MessageRecord[]> {
    return this.analysis.getPendingAIAnalysisMessages(limit);
  }

  getConversationContextBefore(input: {
    channelId: string;
    threadId: string | null;
    beforeCreatedAt: number;
    limit: number;
  }): Promise<MessageRecord[]> {
    return this.analysis.getConversationContextBefore(input);
  }

  getPendingMessagesByConversation(
    conversationKey: string,
    limit?: number,
  ): Promise<MessageRecord[]> {
    return this.analysis.getPendingMessagesByConversation(
      conversationKey,
      limit,
    );
  }

  getPendingConversationKeys(limit?: number): Promise<string[]> {
    return this.analysis.getPendingConversationKeys(limit);
  }

  getConversationKeysWithIncompleteAnalysis(limit?: number): Promise<string[]> {
    return this.analysis.getConversationKeysWithIncompleteAnalysis(limit);
  }

  getIncompleteMessagesByConversation(
    conversationKey: string,
    limit?: number,
  ): Promise<MessageRecord[]> {
    return this.analysis.getIncompleteMessagesByConversation(
      conversationKey,
      limit,
    );
  }

  // ── Edit History ─────────────────────────────────────────────────────────

  insertMessageEdit(
    messageId: string,
    oldContent: string,
    editedAt: number,
  ): Promise<void> {
    return this.crud.insertMessageEdit(messageId, oldContent, editedAt);
  }

  // ── Search ──────────────────────────────────────────────────────────────

  searchMessages(input: {
    query: string;
    channelId?: string;
    guildId?: string;
    limit?: number;
  }): Promise<MessageRecord[]> {
    return this.search.searchMessages(input);
  }

  // ── Pagination ──────────────────────────────────────────────────────────

  listMessages(query: MessageQuery): Promise<PageResult<MessageRecord>> {
    return this.pagination.listMessages(query);
  }

  listReviewMessages(
    query: Omit<MessageQuery, "status">,
  ): Promise<PageResult<MessageRecord>> {
    return this.pagination.listReviewMessages(query);
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  getExpiredMessages(retentionDays: number): Promise<MessageRecord[]> {
    return this.cleanup.getExpiredMessages(retentionDays);
  }

  revertStuckProcessingMessages(timeoutMs?: number): Promise<number> {
    return this.cleanup.revertStuckProcessingMessages(timeoutMs);
  }
}
