// Phase 2 E2E: demux → VideoStream → native packetizer chain (local pair).
// Run: npx tsx tests/golive-videostream-e2e.ts

import { createReadStream } from "node:fs";
import { demux } from "../src/goLive/Demuxer.js";
import { loadNative } from "../src/goLive/native.js";
import { VideoStream } from "../src/goLive/VideoStream.js";

async function main() {
  const native = loadNative();
  const { PeerConnection } = native;

  const pcA = new PeerConnection({ iceServers: [] });
  const pcB = new PeerConnection({ iceServers: [] });

  pcA.onStateChange(() => {});
  pcB.onStateChange(() => {});

  // Both peers declare audio+video tracks (exact passing test-packetizer
  // pattern — tracks trigger negotiation).
  pcA.addTrack("0", "audio");
  pcA.addTrack("1", "video");
  pcB.addTrack("0", "audio");
  const trackB = pcB.addTrack("1", "video");
  if (!trackB) throw new Error("no track from addTrack");

  const track = trackB;
  // NOTE: setPacketizer is called AFTER connected (see below) — calling it
  // before negotiation breaks the offer (libdatachannel negotiation state).

  const offer = await pcA.createOffer();
  console.log("T1 offer");
  pcB.setRemoteDescription(offer, "offer");
  const answer = await pcB.createAnswer(offer);
  console.log("T2 answer");
  pcA.setRemoteDescription(answer, "answer");

  await new Promise((r) => setTimeout(r, 1500));
  console.log("T3 states:", pcA.state(), "/", pcB.state());

  // Discord-style SSRC/payload: H264 101 @ 90kHz, playout ext id 5
  track.setPacketizer("h264", 0x1234, 101, 90000, 5, 0, 10);

  const { video, close } = await demux(createReadStream("/tmp/sample.h264"), {
    format: "h264",
  });
  console.log("video stream:", video.codecName, video.width, "x", video.height);

  const conn = {
    sendVideoFrame: (frame: Buffer, frametime: number) => {
      track.sendFrame(frame);
      track.addTimestamp(Math.round((frametime * 90000) / 1000));
    },
  } as unknown as { sendVideoFrame(frame: Buffer, frametime: number): void };

  const vStream = new VideoStream(conn as never);
  let sent = 0;
  const origSend = conn.sendVideoFrame;
  conn.sendVideoFrame = (frame: Buffer, frametime: number) => {
    sent++;
    origSend(frame, frametime);
  };

  video.stream.pipe(vStream);
  await new Promise((r) => setTimeout(r, 4000));

  console.log(`sent ${sent} frames via VideoStream; B state=${pcB.state()}`);
  const ok = sent > 0 && pcB.state() === "connected";
  close();
  pcA.close();
  pcB.close();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E failed:", e);
  process.exit(1);
});
