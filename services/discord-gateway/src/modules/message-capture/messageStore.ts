import { decodeCursor, encodeCursor } from "@bete/shared";
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
import { AttachmentsDb } from "./attachments.db.js";
import { type AIAnalysisUpdate, MessagesDb } from "./messages.db.js";
import { ModerationActionsDb } from "./moderation-actions.db.js";
import { RetentionDb } from "./retention.db.js";
import { ReviewsDb } from "./reviews.db.js";

export { decodeCursor, encodeCursor } from "@bete/shared";
export type { AIAnalysisUpdate } from "./messages.db.js";

// ─── Lazy singleton ────────────────────────────────────────────────────────

let _instance: MessageStore | null = null;

function getInstance(): MessageStore {
  if (!_instance) {
    const database = getDatabase() as unknown as NodePgDatabase<typeof schema>;
    const logger = createChildLogger("message-store");
    _instance = new MessageStore(database, logger);
  }
  return _instance;
}

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

  getRetentionPolicy(guildId: string): Promise<RetentionPolicy | null> {
    return this.retention.getRetentionPolicy(guildId);
  }

  upsertRetentionPolicy(
    policy: Omit<RetentionPolicy, "created_at" | "updated_at">,
  ): Promise<RetentionPolicy> {
    return this.retention.upsertRetentionPolicy(policy);
  }
}

// ─── Backward-compatible function exports ──────────────────────────────────
// These delegate to a lazy singleton MessageStore instance so existing
// code that imports individual functions continues to work unchanged.

// Messages
export const insertMessage = (message: MessageRecord): Promise<void> =>
  getInstance().insertMessage(message);

export const upsertMessageForCapture = (
  message: MessageRecord,
): Promise<boolean> => getInstance().upsertMessageForCapture(message);

export const updateMessageAsEdited = (
  messageId: string,
  editedContent: string,
  editedAt: number,
): Promise<void> =>
  getInstance().updateMessageAsEdited(messageId, editedContent, editedAt);

export const updateMessageAsDeleted = (
  messageId: string,
  deletedAt: number,
): Promise<void> => getInstance().updateMessageAsDeleted(messageId, deletedAt);

export const getMessagesByChannel = (
  channelId: string,
  limit?: number,
  offset?: number,
  guildId?: string,
): Promise<MessageRecord[]> =>
  getInstance().getMessagesByChannel(channelId, limit, offset, guildId);

export const updateMessageAIAnalysis = (
  messageId: string,
  result: AIAnalysisUpdate,
): Promise<MessageRecord | null> =>
  getInstance().updateMessageAIAnalysis(messageId, result);

export const updateMessagesAIAnalysisBulk = (
  updates: Array<{ messageId: string; result: AIAnalysisUpdate }>,
): Promise<MessageRecord[]> =>
  getInstance().updateMessagesAIAnalysisBulk(updates);

export const getPendingAIAnalysisMessages = (
  limit?: number,
): Promise<MessageRecord[]> =>
  getInstance().getPendingAIAnalysisMessages(limit);

export const getMessageById = (
  messageId: string,
): Promise<MessageRecord | null> => getInstance().getMessageById(messageId);

export const listMessages = (
  query: MessageQuery,
): Promise<PageResult<MessageRecord>> => getInstance().listMessages(query);

export const listReviewMessages = (
  query: Omit<MessageQuery, "status">,
): Promise<PageResult<MessageRecord>> =>
  getInstance().listReviewMessages(query);

export const getConversationContextBefore = (input: {
  channelId: string;
  threadId: string | null;
  beforeCreatedAt: number;
  limit: number;
}): Promise<MessageRecord[]> =>
  getInstance().getConversationContextBefore(input);

export const getPendingMessagesByConversation = (
  conversationKey: string,
  limit?: number,
): Promise<MessageRecord[]> =>
  getInstance().getPendingMessagesByConversation(conversationKey, limit);

export const getPendingConversationKeys = (limit?: number): Promise<string[]> =>
  getInstance().getPendingConversationKeys(limit);

export const getConversationKeysWithIncompleteAnalysis = (
  limit?: number,
): Promise<string[]> =>
  getInstance().getConversationKeysWithIncompleteAnalysis(limit);

export const getIncompleteMessagesByConversation = (
  conversationKey: string,
  limit?: number,
): Promise<MessageRecord[]> =>
  getInstance().getIncompleteMessagesByConversation(conversationKey, limit);

export const searchMessages = (input: {
  query: string;
  channelId?: string;
  guildId?: string;
  limit?: number;
}): Promise<MessageRecord[]> => getInstance().searchMessages(input);

export const getExpiredMessages = (
  retentionDays: number,
): Promise<MessageRecord[]> => getInstance().getExpiredMessages(retentionDays);

export const revertStuckProcessingMessages = (
  timeoutMs?: number,
): Promise<number> => getInstance().revertStuckProcessingMessages(timeoutMs);

// Attachments
export const insertAttachment = (attachment: AttachmentRecord): Promise<void> =>
  getInstance().insertAttachment(attachment);

export const getAttachmentsByChannel = (
  channelId: string,
  limit?: number,
  offset?: number,
  guildId?: string,
): Promise<AttachmentRecord[]> =>
  getInstance().getAttachmentsByChannel(channelId, limit, offset, guildId);

export const updateAttachmentAsUploaded = (
  attachmentId: string,
  uploadedUrl: string,
  uploadedAt: number,
): Promise<void> =>
  getInstance().updateAttachmentAsUploaded(
    attachmentId,
    uploadedUrl,
    uploadedAt,
  );

export const updateAttachmentDiscordUrl = (
  attachmentId: string,
  discordUrl: string,
): Promise<void> =>
  getInstance().updateAttachmentDiscordUrl(attachmentId, discordUrl);

export const updateAttachmentAsFailedUpload = (
  attachmentId: string,
  error: string,
): Promise<void> =>
  getInstance().updateAttachmentAsFailedUpload(attachmentId, error);

export const getAttachmentsForMessages = (
  messageIds: string[],
): Promise<AttachmentRecord[]> =>
  getInstance().getAttachmentsForMessages(messageIds);

// Reviews
export const createMessageReview = (
  review: Omit<MessageReview, "id" | "created_at">,
): Promise<MessageReview> => getInstance().createMessageReview(review);

export const getMessageReview = (id: string): Promise<MessageReview | null> =>
  getInstance().getMessageReview(id);

export const listMessageReviews = (query: {
  guildId?: string;
  channelId?: string;
  status?: string[];
  cursor?: string;
  limit: number;
}): Promise<PageResult<MessageReview>> =>
  getInstance().listMessageReviews(query);

export const updateMessageReview = (
  id: string,
  updates: Partial<Omit<MessageReview, "id" | "created_at">>,
): Promise<MessageReview | null> =>
  getInstance().updateMessageReview(id, updates);

// Moderation Actions
export const createModerationAction = (
  action: Omit<ModerationAction, "id" | "created_at">,
): Promise<ModerationAction> => getInstance().createModerationAction(action);

export const getModerationAction = (
  id: string,
): Promise<ModerationAction | null> => getInstance().getModerationAction(id);

export const listModerationActions = (query: {
  guildId?: string;
  status?: string[];
  cursor?: string;
  limit: number;
}): Promise<PageResult<ModerationAction>> =>
  getInstance().listModerationActions(query);

export const updateModerationAction = (
  id: string,
  updates: Partial<Omit<ModerationAction, "id" | "created_at">>,
): Promise<ModerationAction | null> =>
  getInstance().updateModerationAction(id, updates);

// Retention
export const getRetentionPolicy = (
  guildId: string,
): Promise<RetentionPolicy | null> => getInstance().getRetentionPolicy(guildId);

export const upsertRetentionPolicy = (
  policy: Omit<RetentionPolicy, "created_at" | "updated_at">,
): Promise<RetentionPolicy> => getInstance().upsertRetentionPolicy(policy);
