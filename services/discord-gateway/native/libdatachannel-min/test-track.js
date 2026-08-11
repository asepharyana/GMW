// Verify addTrack produces SDP with audio+video media sections.
"use strict";
const { PeerConnection } = require("./build/Release/datachannel_min.node");

const pc = new PeerConnection({ iceServers: [] });
const audioTrack = pc.addTrack("0", "audio");
const videoTrack = pc.addTrack("1", "video");

pc.onStateChange((s) => console.log("[test-track] state:", s));

pc.createOffer().then((sdp) => {
  const hasAudio = /^m=audio\s/m.test(sdp);
  const hasVideo = /^m=video\s/m.test(sdp);
  const audioPts = sdp.match(/a=rtpmap:(\d+) opus/g) || [];
  const videoPts = sdp.match(/a=rtpmap:(\d+) H264/g) || [];
  console.log("[test-track] SDP bytes:", sdp.length);
  console.log("[test-track] m=audio:", hasAudio, "| m=video:", hasVideo);
  console.log("[test-track] opus pt:", audioPts, "| H264 pt:", videoPts);
  console.log("[test-track] audio track send ok:", typeof audioTrack.send === "function");
  console.log("[test-track] video track send ok:", typeof videoTrack.send === "function");
  const ok = hasAudio && hasVideo && audioPts.length > 0 && videoPts.length > 0;
  console.log(ok ? "TRACK TEST PASSED" : "TRACK TEST FAILED");
  pc.close();
  process.exit(ok ? 0 : 1);
}).catch((e) => {
  console.error("[test-track] FAILED:", e.message);
  process.exit(1);
});

setTimeout(() => {
  console.error("[test-track] TIMEOUT");
  process.exit(1);
}, 20000);
