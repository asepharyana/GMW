// Two-peer RTP capture test: A sends REAL H264 frames through the binding's
// packetizer chain to B over localhost. tcpdump (run externally on lo) captures
// the RTP; a Python script reassembles AnnexB and ffmpeg decodes it.
//
// Usage:
//   node test-rtp-capture.js <mode>   mode = "a" (sender) | "b" (receiver)
//   Sender writes the negotiated SDP pieces to /tmp/rtp-a.sdp /tmp/rtp-b.sdp
//   Receiver listens and keeps alive.
"use strict";
const { PeerConnection } = require("./build/Release/datachannel_min.node");
const fs = require("fs");

const mode = process.argv[2] || "a";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const pc = new PeerConnection({ iceServers: [] });
  const audio = pc.addTrack("0", "audio");
  const video = pc.addTrack("1", "video");

  if (mode === "a") {
    // Sender: generate offer, hand to B via files, get B's answer
    const offer = await pc.createOffer();
    fs.writeFileSync("/tmp/rtp-offer.sdp", offer);
    console.log("[a] offer written", offer.length, "bytes");

    // wait for B to write its answer
    for (let i = 0; i < 300; i++) {
      if (fs.existsSync("/tmp/rtp-answer.sdp")) break;
      await sleep(200);
    }
    const answer = fs.readFileSync("/tmp/rtp-answer.sdp", "utf8");
    pc.setRemoteDescription(answer, "answer");

    // wait connected
    for (let i = 0; i < 50; i++) {
      if (pc.state() === "connected") break;
      await sleep(100);
    }
    console.log("[a] state:", pc.state());
    if (pc.state() !== "connected") {
      console.log("[a] FAILED not connected");
      process.exit(1);
    }

    // Setup packetizer like the gateway does
    video.setPacketizer("h264", 5678, 101, 90000, 5, 0, 10);

    // Real H264 AnnexB (baseline) — read from file created by ffmpeg
    const data = fs.readFileSync("/tmp/rtp-input.h264");
    console.log("[a] input h264 bytes:", data.length);

    // Split into NAL units by start codes, then group into access units
    // the same way Demuxer does (param sets + one slice per frame).
    const start3 = Buffer.from([0, 0, 1]);
    const start4 = Buffer.from([0, 0, 0, 1]);
    const nals = [];
    let i = 0;
    while (i < data.length) {
      let start = -1;
      let startLen = 0;
      for (let j = i; j < data.length - 3; j++) {
        if (data[j] === 0 && data[j + 1] === 0 && data[j + 2] === 1) {
          start = j;
          startLen = 3;
          if (j > 0 && data[j - 1] === 0) {
            start = j - 1;
            startLen = 4;
          }
          break;
        }
      }
      if (start === -1) break;
      if (start > i) {
        nals.push(data.subarray(i, start));
      }
      i = start + startLen;
    }
    console.log("[a] NALs:", nals.length);

    // Group: buffer param sets, flush on slice (like Demuxer.flushAccessUnit)
    let pending = [];
    let frameCount = 0;
    const flush = () => {
      if (pending.length === 0) return;
      const parts = pending.map((n) => Buffer.concat([start4, n]));
      const au = Buffer.concat(parts);
      pending = [];
      video.sendFrame(au);
      video.addTimestamp(3000); // 30fps @ 90kHz
      frameCount++;
    };
    for (const n of nals) {
      const t = n[0] & 0x1f;
      if (t === 1 || t === 5) {
        flush(); // previous AU closed by this slice
        pending.push(n);
      } else {
        pending.push(n); // param set / SEI
      }
    }
    flush();
    console.log("[a] sent frames:", frameCount);
    await sleep(3000); // let packets flow
    console.log("[a] done");
    pc.close();
    process.exit(0);
  } else {
    // Receiver: read offer, answer, keep alive
    for (let i = 0; i < 300; i++) {
      if (fs.existsSync("/tmp/rtp-offer.sdp")) break;
      await sleep(200);
    }
    const offer = fs.readFileSync("/tmp/rtp-offer.sdp", "utf8");
    pc.setRemoteDescription(offer, "offer");
    const answer = await pc.createAnswer(offer);
    fs.writeFileSync("/tmp/rtp-answer.sdp", answer);
    console.log("[b] answer written");
    for (let i = 0; i < 50; i++) {
      if (pc.state() === "connected") break;
      await sleep(100);
    }
    console.log("[b] state:", pc.state());
    await sleep(10000); // hold while sender streams
    console.log("[b] done");
    pc.close();
    process.exit(0);
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
setTimeout(() => {
  console.error("TIMEOUT");
  process.exit(1);
}, 30000);
