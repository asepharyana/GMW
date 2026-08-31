import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetVideoRecorderState,
  destroyGuildSelfbotVoice,
  ensureSelfbotVoice,
  setVideoRecorderClient,
  setVideoRecordingsDir,
  startVideoRecording,
  stopVideoRecording,
  trackChannel,
  untrackChannel,
} from "../src/modules/voice-recording/videoRecorder.js";

// ─── mock the selfbot VoiceConnection/watch/recorder surface ─────────────
function makeVoiceManager() {
  const recorder = {
    on: vi.fn(),
    destroy: vi.fn(),
  };
  const watchConn = { sendSignalScreenshare: vi.fn(async () => {}) };
  const voiceConn = {
    status: 0, // VoiceStatus.CONNECTED
    disconnect: vi.fn(),
    receiver: {
      createVideoStream: vi.fn(() => recorder),
    },
    joinStreamConnection: vi.fn(async () => watchConn),
  };
  const joinChannel = vi.fn(async () => voiceConn);
  return { voiceConn, watchConn, recorder, joinChannel };
}

function makeChannel(guildId = "g1", channelId = "c1") {
  return {
    id: channelId,
    guild: { id: guildId },
  };
}

function makeClient() {
  return {
    user: { id: "bot1" },
    voice: makeVoiceManager(),
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
  setVideoRecordingsDir("/tmp/gmw-vidrec-test");
});

describe("videoRecorder", () => {
  it("registers a single voiceStateUpdate listener on the client", () => {
    const client = makeClient();
    setVideoRecorderClient(client);
    setVideoRecorderClient(client); // idempotent
    expect(client.on).toHaveBeenCalledTimes(1);
    expect(client.on).toHaveBeenCalledWith(
      "voiceStateUpdate",
      expect.any(Function),
    );
  });

  it("startVideoRecording does watch handshake + createVideoStream to a .mkv path", async () => {
    const client = makeClient();
    const { watchConn } = client.voice;
    setVideoRecorderClient(client);
    trackChannel("g1", makeChannel());

    const handle = await startVideoRecording(makeChannel(), makeUser());

    expect(handle).not.toBeNull();
    expect(handle?.path).toMatch(/video-c1-\d+\.mkv$/);
    expect(client.voice.voiceConn.joinStreamConnection).toHaveBeenCalled();
    expect(watchConn.sendSignalScreenshare).toHaveBeenCalled();
    expect(
      client.voice.voiceConn.receiver.createVideoStream,
    ).toHaveBeenCalledWith(expect.any(String), expect.stringMatching(/\.mkv$/));
  });

  it("refuses to record the bot's own video", async () => {
    const client = makeClient();
    setVideoRecorderClient(client);
    const handle = await startVideoRecording(makeChannel(), "bot1");
    expect(handle).toBeNull();
    expect(client.voice.voiceConn.joinStreamConnection).not.toHaveBeenCalled();
  });

  it("is idempotent for the same guild:user (no duplicate recorder)", async () => {
    const client = makeClient();
    setVideoRecorderClient(client);
    const ch = makeChannel();
    const u = makeUser();
    await startVideoRecording(ch, u);
    await startVideoRecording(ch, u);
    expect(
      client.voice.voiceConn.receiver.createVideoStream,
    ).toHaveBeenCalledTimes(1);
  });

  it("stopVideoRecording destroys the recorder", async () => {
    const client = makeClient();
    setVideoRecorderClient(client);
    const ch = makeChannel();
    const u = makeUser();
    await startVideoRecording(ch, u);
    stopVideoRecording("g1", u);
    expect(client.voice.recorder.destroy).toHaveBeenCalled();
  });

  it("untrackChannel tears down active video recorders for the guild", async () => {
    const client = makeClient();
    setVideoRecorderClient(client);
    const ch = makeChannel();
    const u = makeUser();
    await startVideoRecording(ch, u);
    untrackChannel("g1");
    expect(client.voice.recorder.destroy).toHaveBeenCalled();
  });

  it("ensureSelfbotVoice establishes and caches the selfbot connection (join once)", async () => {
    const client = makeClient();
    setVideoRecorderClient(client);
    const ch = makeChannel();
    const r1 = await ensureSelfbotVoice(ch);
    expect(r1?.status).toBe(0);
    expect(client.voice.joinChannel).toHaveBeenCalledTimes(1);
    // Second call reuses the cached CONNECTED connection — no re-join.
    const r2 = await ensureSelfbotVoice(makeChannel());
    expect(client.voice.joinChannel).toHaveBeenCalledTimes(1);
    expect(r2?.status).toBe(0);
  });

  it("untrackChannel destroys the cached selfbot voice connection", async () => {
    const client = makeClient();
    setVideoRecorderClient(client);
    await ensureSelfbotVoice(makeChannel("g1", "c1"));
    const other = makeClient();
    setVideoRecorderClient(other);
    await ensureSelfbotVoice(makeChannel("g2", "c2"));
    untrackChannel("g1");
    expect(client.voice.voiceConn.disconnect).toHaveBeenCalled();
    // g2 connection untouched by g1 teardown
    expect(other.voice.voiceConn.disconnect).not.toHaveBeenCalled();
  });

  it("destroyGuildSelfbotVoice disconnects the selfbot connection", async () => {
    const client = makeClient();
    setVideoRecorderClient(client);
    await ensureSelfbotVoice(makeChannel());
    destroyGuildSelfbotVoice("g1");
    expect(client.voice.voiceConn.disconnect).toHaveBeenCalled();
  });
});
