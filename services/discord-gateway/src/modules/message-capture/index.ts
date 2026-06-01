export { registerMessageCapture } from "./messageCapture.js";
export {
  getDisplayContent,
  getMessageLocation,
  getMessageMetadata,
} from "../message-capture/messageMetadata.js";
export {
  getMessageById,
  insertAttachment,
  updateMessageAsDeleted,
  updateMessageAsEdited,
  upsertMessageForCapture,
} from "../message-capture/messageStore.js";
export type {
  AIRecommendedAction,
  AISeverity,
  AIStatus,
  AttachmentRecord,
  MessageRecord,
  VoiceSegmentRecord,
} from "../message-capture/types.js";
