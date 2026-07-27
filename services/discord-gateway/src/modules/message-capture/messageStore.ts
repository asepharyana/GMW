import { createChildLogger, type Logger } from "@bete/shared/logger";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDatabase } from "../../shared/database/drizzle.js";
import type * as schema from "../../shared/database/schema.js";
import type {
  AttachmentRecord,
  MessageQuery,
  MessageRecord,
  MessageReview,
  ModerationAction,
  PageResult,
  RetentionPolicy,
} from "../message-capture/types.js";
import { AttachmentsDb } from "./attachmentsDb.js";
import { type AIAnalysisUpdate, MessagesDb } from "./messagesDb.js";
import { ModerationActionsDb } from "./moderationActionsDb.js";
import { RetentionDb } from "./retentionDb.js";
import { ReviewsDb } from "./reviewsDb.js";

export type { AIAnalysisUpdate } from "./messagesDb.js";

// ─── MessageStore Facade ────────────────────────────────────────────────────

export class MessageStore {
  readonly messages: MessagesDb;
  readonly attachments: AttachmentsDb;
  readonly reviews: ReviewsDb;
  readonly moderationActions: ModerationActionsDb;
  readonly retention: RetentionDb;

  constructor(db: NodePgDatabase<typeof schema>, logger: Logger) {
    this.messages = new MessagesDb(db, logger);
    this.attachments = new AttachmentsDb(db, logger);
    this.reviews = new ReviewsDb(db, logger);
    this.moderationActions = new ModerationActionsDb(db, logger);
    this.retention = new RetentionDb(db, logger);
  }

  // ── Edit History ────────────────────────────────────────────────────────

  insertMessageEdit(
    messageId: string,
    oldContent: string,
    editedAt: number,
  ): Promise<void> {
    return this.messages.insertMessageEdit(messageId, oldContent, editedAt);
  }

  // ── Messages ───────────────────────────────────────────────────────────

  insertMessage(message: MessageRecord): Promise<void> {
    return this.messages.insertMessage(message);
  }

  upsertMessageForCapture(message: MessageRecord): Promise<boolean> {
    return this.messages.upsertMessageForCapture(message);
  }

  updateMessageAsEdited(
    messageId: string,
    editedContent: string,
    editedAt: number,
  ): Promise<void> {
    return this.messages.updateMessageAsEdited(
      messageId,
      editedContent,
      editedAt,
    );
  }

  updateMessageAsDeleted(messageId: string, deletedAt: number): Promise<void> {
    return this.messages.updateMessageAsDeleted(messageId, deletedAt);
  }

  getMessagesByChannel(
    channelId: string,
    limit?: number,
    offset?: number,
    guildId?: string,
  ): Promise<MessageRecord[]> {
    return this.messages.getMessagesByChannel(
      channelId,
      limit,
      offset,
      guildId,
    );
  }

  updateMessageAIAnalysis(
    messageId: string,
    result: AIAnalysisUpdate,
  ): Promise<MessageRecord | null> {
    return this.messages.updateMessageAIAnalysis(messageId, result);
  }

  updateMessagesAIAnalysisBulk(
    updates: Array<{ messageId: string; result: AIAnalysisUpdate }>,
  ): Promise<MessageRecord[]> {
    return this.messages.updateMessagesAIAnalysisBulk(updates);
  }

  getPendingAIAnalysisMessages(limit?: number): Promise<MessageRecord[]> {
    return this.messages.getPendingAIAnalysisMessages(limit);
  }

  getMessageById(messageId: string): Promise<MessageRecord | null> {
    return this.messages.getMessageById(messageId);
  }

  listMessages(query: MessageQuery): Promise<PageResult<MessageRecord>> {
    return this.messages.listMessages(query);
  }

  listReviewMessages(
    query: Omit<MessageQuery, "status">,
  ): Promise<PageResult<MessageRecord>> {
    return this.messages.listReviewMessages(query);
  }

  getConversationContextBefore(input: {
    channelId: string;
    threadId: string | null;
    beforeCreatedAt: number;
    limit: number;
  }): Promise<MessageRecord[]> {
    return this.messages.getConversationContextBefore(input);
  }

  getPendingMessagesByConversation(
    conversationKey: string,
    limit?: number,
  ): Promise<MessageRecord[]> {
    return this.messages.getPendingMessagesByConversation(
      conversationKey,
      limit,
    );
  }

  getPendingConversationKeys(limit?: number): Promise<string[]> {
    return this.messages.getPendingConversationKeys(limit);
  }

  getConversationKeysWithIncompleteAnalysis(limit?: number): Promise<string[]> {
    return this.messages.getConversationKeysWithIncompleteAnalysis(limit);
  }

  getIncompleteMessagesByConversation(
    conversationKey: string,
    limit?: number,
  ): Promise<MessageRecord[]> {
    return this.messages.getIncompleteMessagesByConversation(
      conversationKey,
      limit,
    );
  }

  searchMessages(input: {
    query: string;
    channelId?: string;
    guildId?: string;
    limit?: number;
  }): Promise<MessageRecord[]> {
    return this.messages.searchMessages(input);
  }

  getExpiredMessages(retentionDays: number): Promise<MessageRecord[]> {
    return this.messages.getExpiredMessages(retentionDays);
  }

  revertStuckProcessingMessages(timeoutMs?: number): Promise<number> {
    return this.messages.revertStuckProcessingMessages(timeoutMs);
  }

  // ── Attachments ────────────────────────────────────────────────────────

  insertAttachment(attachment: AttachmentRecord): Promise<void> {
    return this.attachments.insertAttachment(attachment);
  }

  getAttachmentsByChannel(
    channelId: string,
    limit?: number,
    offset?: number,
    guildId?: string,
  ): Promise<AttachmentRecord[]> {
    return this.attachments.getAttachmentsByChannel(
      channelId,
      limit,
      offset,
      guildId,
    );
  }

  updateAttachmentAsUploaded(
    attachmentId: string,
    uploadedUrl: string,
    uploadedAt: number,
  ): Promise<void> {
    return this.attachments.updateAttachmentAsUploaded(
      attachmentId,
      uploadedUrl,
      uploadedAt,
    );
  }

  updateAttachmentDiscordUrl(
    attachmentId: string,
    discordUrl: string,
  ): Promise<void> {
    return this.attachments.updateAttachmentDiscordUrl(
      attachmentId,
      discordUrl,
    );
  }

  updateAttachmentAsFailedUpload(
    attachmentId: string,
    error: string,
  ): Promise<void> {
    return this.attachments.updateAttachmentAsFailedUpload(attachmentId, error);
  }

  getAttachmentsForMessages(messageIds: string[]): Promise<AttachmentRecord[]> {
    return this.attachments.getAttachmentsForMessages(messageIds);
  }

  // ── Reviews ────────────────────────────────────────────────────────────

  createMessageReview(
    review: Omit<MessageReview, "id" | "created_at">,
  ): Promise<MessageReview> {
    return this.reviews.createMessageReview(review);
  }

  getMessageReview(id: string): Promise<MessageReview | null> {
    return this.reviews.getMessageReview(id);
  }

  listMessageReviews(query: {
    guildId?: string;
    channelId?: string;
    status?: string[];
    cursor?: string;
    limit: number;
  }): Promise<PageResult<MessageReview>> {
    return this.reviews.listMessageReviews(query);
  }

  updateMessageReview(
    id: string,
    updates: Partial<Omit<MessageReview, "id" | "created_at">>,
  ): Promise<MessageReview | null> {
    return this.reviews.updateMessageReview(id, updates);
  }

  // ── Moderation Actions ─────────────────────────────────────────────────

  createModerationAction(
    action: Omit<ModerationAction, "id" | "created_at">,
  ): Promise<ModerationAction> {
    return this.moderationActions.createModerationAction(action);
  }

  getModerationAction(id: string): Promise<ModerationAction | null> {
    return this.moderationActions.getModerationAction(id);
  }

  listModerationActions(query: {
    guildId?: string;
    status?: string[];
    cursor?: string;
    limit: number;
  }): Promise<PageResult<ModerationAction>> {
    return this.moderationActions.listModerationActions(query);
  }

  updateModerationAction(
    id: string,
    updates: Partial<Omit<ModerationAction, "id" | "created_at">>,
  ): Promise<ModerationAction | null> {
    return this.moderationActions.updateModerationAction(id, updates);
  }

  // ── Retention ──────────────────────────────────────────────────────────

  getRetentionPolicy(
    guildId: string,
    channelId?: string,
  ): Promise<RetentionPolicy | null> {
    return this.retention.getRetentionPolicy(guildId, channelId);
  }

  upsertRetentionPolicy(
    policy: Omit<RetentionPolicy, "created_at" | "updated_at">,
  ): Promise<RetentionPolicy> {
    return this.retention.upsertRetentionPolicy(policy);
  }
}

// ─── Singleton instance ─────────────────────────────────────────────────────

const singletonLogger = createChildLogger("message-store");

/**
 * Lazily-initialized singleton via Proxy.
 *
 * `messageStore` is imported at module level across ~30 files, long before
 * `initializeDatabase()` has been called in bootstrap.  Instead of making every
 * caller async-aware, we export a Proxy that defers MessageStore construction
 * until the first method call.
 *
 * Once created, the real store is cached — subsequent calls resolve properties
 * directly from the cached instance without re-binding or re-resolving.
 */
let _store: MessageStore | null = null;

function resolveStore(): MessageStore {
  if (!_store) {
    const db = getDatabase() as unknown as NodePgDatabase<typeof schema>;
    _store = new MessageStore(db, singletonLogger);
  }
  return _store;
}

export const messageStore: MessageStore = new Proxy<MessageStore>(
  {} as MessageStore,
  {
    get(_, prop: string | symbol) {
      const store = resolveStore();
      const value = (store as unknown as Record<string | symbol, unknown>)[prop];
      return typeof value === "function" ? value.bind(store) : value;
    },
  },
);
