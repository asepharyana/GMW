// Verify setPacketizer + sendFrame: two peers connect, audio+video tracks
// packetize real encoded frames (opus + AnnexB H264), RTP flows without crash.
"use strict";
const { PeerConnection } = require("./build/Release/datachannel_min.node");

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const pcA = new PeerConnection({ iceServers: [] });
  const pcB = new PeerConnection({ iceServers: [] });

  const aAudio = pcA.addTrack("0", "audio");
  const aVideo = pcA.addTrack("1", "video");
  pcB.addTrack("0", "audio");
  pcB.addTrack("1", "video");

  let states = { a: "", b: "" };
  pcA.onStateChange((s) => (states.a = s));
  pcB.onStateChange((s) => (states.b = s));

  // A: offer (createDataChannel not needed — tracks trigger negotiation)
  const offer = await pcA.createOffer();
  pcB.setRemoteDescription(offer, "offer");
  const answer = await pcB.createAnswer(offer);
  pcA.setRemoteDescription(answer, "answer");

  // Wait for connected
  for (let i = 0; i < 50; i++) {
    if (states.a === "connected" && states.b === "connected") break;
    await sleep(100);
  }
  console.log("[pkt] states:", states.a, states.b);
  if (states.a !== "connected" || states.b !== "connected") {
    console.log("PKT TEST FAILED: not connected");
    process.exit(1);
  }

  // Setup packetizers on A (sender)
  aAudio.setPacketizer("audio", 1234, 120, 48000, 5, 0, 1);
  aVideo.setPacketizer("h264", 5678, 101, 90000, 5, 0, 10);

  // Fake opus frame (20ms @48kHz stereo — payload can be any bytes)
  const opusFrame = Buffer.alloc(160);
  for (let i = 0; i < 160; i++) opusFrame[i] = i & 0xff;

  // Fake AnnexB H264 frame: SPS + PPS + IDR slice
  const sps = Buffer.from([0x00, 0x00, 0x00, 0x01, 0x67, 0x42, 0xc0, 0x1e, 0xd9, 0x01, 0x40, 0x7e]);
  const pps = Buffer.from([0x00, 0x00, 0x00, 0x01, 0x68, 0xce, 0x3c, 0x80]);
  const idr = Buffer.from([0x00, 0x00, 0x00, 0x01, 0x65, 0x88, 0x84, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
  const h264Frame = Buffer.concat([sps, pps, idr]);

  // Send 10 audio frames (20ms each) + 3 video frames (33ms each)
  for (let i = 0; i < 10; i++) {
    aAudio.sendFrame(opusFrame);
    aAudio.addTimestamp(960); // 20ms @ 48kHz
  }
  for (let i = 0; i < 3; i++) {
    aVideo.sendFrame(h264Frame);
    aVideo.addTimestamp(3000); // 33ms @ 90kHz
  }

  await sleep(500);
  console.log("[pkt] after send: states:", states.a, states.b);
  console.log("[pkt] audio track open:", aAudio.isOpen(), "| video track open:", aVideo.isOpen());
  const ok = states.a === "connected" && aAudio.isOpen() && aVideo.isOpen();
  console.log(ok ? "PKT TEST PASSED" : "PKT TEST FAILED");
  pcA.close();
  pcB.close();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("[pkt] FAILED:", e.message);
  process.exit(1);
});

setTimeout(() => {
  console.error("[pkt] TIMEOUT");
  process.exit(1);
}, 25000);
