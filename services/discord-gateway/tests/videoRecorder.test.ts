import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetVideoRecorderState,
  setVideoRecorderClient,
  setVideoRecordingsDir,
  startVideoRecording,
  stopVideoRecording,
  trackChannel,
  untrackChannel,
} from "../src/modules/voice-recording/videoRecorder.js";
import * as streamWatch from "../src/modules/voice-recording/streamWatchReceiver.js";

// ─── mocks ─────────────────────────────────────────────────────────────
function makeChannel(guildId = "g1", channelId = "c1") {
  return {
    id: channelId,
    guild: { id: guildId },
  };
}

function makeClient() {
  return {
    user: { id: "bot1" },
    on: vi.fn(),
  };
}

let seq = 0;
function makeUser() {
  seq += 1;
  return `user-${seq}`;
}

beforeEach(() => {
  __resetVideoRecorderState();
  vi.restoreAllMocks();
  setVideoRecordingsDir("/tmp/gmw-vidrec-test");
});

describe("videoRecorder (stream-watch orchestration)", () => {
  it("registers a voiceStateUpdate + raw listener on the client (idempotent)", () => {
    const client = makeClient();
    setVideoRecorderClient(client);
    setVideoRecorderClient(client); // idempotent (videoRecorder + streamWatch)
    // one raw (streamWatch) + one voiceStateUpdate (videoRecorder)
    expect(client.on).toHaveBeenCalledTimes(2);
    expect(client.on).toHaveBeenCalledWith(
      "voiceStateUpdate",
      expect.any(Function),
    );
    expect(client.on).toHaveBeenCalledWith("raw", expect.any(Function));
  });

  it("startVideoRecording delegates to streamWatchReceiver.startStreamWatch", () => {
    const spy = vi.spyOn(streamWatch, "startStreamWatch").mockImplementation(() => {});
    const ch = makeChannel();
    startVideoRecording(ch, makeUser());
    expect(spy).toHaveBeenCalledWith(ch, expect.any(String));
  });

  it("refuses to record the bot's own video", () => {
    setVideoRecorderClient(makeClient());
    const spy = vi.spyOn(streamWatch, "startStreamWatch").mockImplementation(() => {});
    startVideoRecording(makeChannel(), "bot1");
    expect(spy).not.toHaveBeenCalled();
  });

  it("stopVideoRecording calls streamWatchReceiver.stopStreamWatch", () => {
    const spy = vi.spyOn(streamWatch, "stopStreamWatch").mockImplementation(() => {});
    const u = makeUser();
    stopVideoRecording("g1", u);
    expect(spy).toHaveBeenCalledWith("g1", u);
  });

  it("untrackChannel tears down all stream watches for the guild", () => {
    const spy = vi.spyOn(streamWatch, "stopAllStreamWatches").mockImplementation(() => {});
    untrackChannel("g1");
    expect(spy).toHaveBeenCalledWith("g1");
  });

  it("the voiceStateUpdate handler starts a watch when a member starts streaming", () => {
    const client = makeClient() as any;
    setVideoRecorderClient(client);
    trackChannel("g1", makeChannel());
    const startSpy = vi.spyOn(streamWatch, "startStreamWatch").mockImplementation(() => {});
    const listener = client.on.mock.calls.find(
      (c: unknown[]) => c[0] === "voiceStateUpdate",
    )?.[1];
    listener(null, { id: "u1", guild: { id: "g1" }, channelId: "c1", streaming: true });
    expect(startSpy).toHaveBeenCalled();
  });

  it("the voiceStateUpdate handler stops a watch when a member stops streaming", () => {
    const client = makeClient() as any;
    setVideoRecorderClient(client);
    trackChannel("g1", makeChannel());
    const stopSpy = vi.spyOn(streamWatch, "stopStreamWatch").mockImplementation(() => {});
    const listener = client.on.mock.calls.find(
      (c: unknown[]) => c[0] === "voiceStateUpdate",
    )?.[1];
    listener(null, { id: "u1", guild: { id: "g1" }, channelId: "c1", streaming: false });
    expect(stopSpy).toHaveBeenCalledWith("g1", "u1");
  });
});
