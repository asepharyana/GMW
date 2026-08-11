// Phase 0 spike: prove the minimal binding can do a full WebRTC handshake
// (offer/answer + ICE + DataChannel) between two local PeerConnections.
"use strict";
const { PeerConnection } = require("./build/Release/datachannel_min.node");

function log(...args) {
  console.log("[spike]", ...args);
}

async function main() {
  const pcA = new PeerConnection({ iceServers: [] });
  const pcB = new PeerConnection({ iceServers: [] });

  const stateLog = [];
  pcA.onStateChange((s) => {
    stateLog.push(`A:${s}`);
    log("A state:", s);
  });
  pcB.onStateChange((s) => {
    stateLog.push(`B:${s}`);
    log("B state:", s);
  });

  // B waits for incoming DataChannel
  const received = new Promise((resolve) => {
    pcB.onDataChannel((dc) => {
      log("B got incoming DataChannel");
      dc.onOpen(() => log("B DataChannel open"));
      dc.onMessage((msg) => {
        log("B received message:", msg);
        dc.send("pong from B");
        resolve(msg);
      });
    });
  });

  // A creates an outgoing DataChannel
  const dcA = pcA.createDataChannel("test");
  dcA.onOpen(() => {
    log("A DataChannel open — sending hello");
    dcA.send("hello from A");
  });
  dcA.onMessage((msg) => {
    log("A received reply:", msg);
  });

  // Offer/answer dance
  log("A createOffer...");
  const offer = await pcA.createOffer();
  log("Offer SDP bytes:", offer.length);
  log("B createAnswer...");
  const answer = await pcB.createAnswer(offer);
  log("Answer SDP bytes:", answer.length);
  const setupMatch = answer.match(/a=setup:(\S+)/);
  log("Answer setup role:", setupMatch ? setupMatch[1] : "NONE");
  pcA.setRemoteDescription(answer, "answer");

  // Wait for message roundtrip
  const msg = await Promise.race([
    received,
    new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT waiting for datachannel message")), 15000)),
  ]);

  log("ROUNDTRIP OK — B got:", msg);
  log("States:", stateLog.join(" | "));

  const aState = pcA.state();
  const bState = pcB.state();
  log("Final states — A:", aState, "B:", bState);

  pcA.close();
  pcB.close();

  if (msg !== "hello from A") throw new Error("wrong message");
  if (aState !== "connected" && aState !== "disconnected") throw new Error("A not connected: " + aState);
  log("SPIKE PASSED ✅");
}

main().catch((e) => {
  console.error("SPIKE FAILED:", e.message);
  process.exit(1);
});
