export {
  getDisplayContent,
  getMessageLocation,
  getMessageMetadata,
} from "../message-capture/messageMetadata.js";
export type {
  AIRecommendedAction,
  AISeverity,
  AIStatus,
  AttachmentRecord,
  MessageRecord,
  VoiceSegmentRecord,
} from "../message-capture/types.js";
export type { TextCaptureTarget } from "./messageCapture.js";
export {
  captureMessage,
  registerMessageCapture,
  setEventBroadcaster,
} from "./messageCapture.js";
export { messageStore } from "./messageStore.js";
