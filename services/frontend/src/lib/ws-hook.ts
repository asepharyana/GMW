import type { WsEventType, WsStatus } from "./ws/types";

export type WsHook = {
  status?: WsStatus;
  on: <E extends WsEventType>(
    eventType: E,
    handler: (data: unknown) => void,
  ) => () => void;
  sendText: (text: string) => void;
};
