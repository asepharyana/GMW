import type { WsEventType } from "./ws/types";

export type WsHook = {
  on: <E extends WsEventType>(
    eventType: E,
    handler: (data: unknown) => void,
  ) => () => void;
};
