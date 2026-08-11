// libdatachannel-min — minimal N-API binding to libdatachannel.
// Exposes ONLY what GMW GoLive needs:
//   PeerConnection (offer/answer, ICE, SDP), DataChannel (signaling),
//   Track send (added in media phase).
// Built against libdatachannel 0.24.0 (built from source in /tmp/ldc-build).

#include <napi.h>
#include <rtc/rtc.hpp>

#include <functional>
#include <memory>
#include <string>
#include <variant>

using namespace Napi;

namespace {

std::string stateToString(rtc::PeerConnection::State s) {
  switch (s) {
    case rtc::PeerConnection::State::New: return "new";
    case rtc::PeerConnection::State::Connecting: return "connecting";
    case rtc::PeerConnection::State::Connected: return "connected";
    case rtc::PeerConnection::State::Disconnected: return "disconnected";
    case rtc::PeerConnection::State::Failed: return "failed";
    case rtc::PeerConnection::State::Closed: return "closed";
    default: return "unknown";
  }
}

std::string binaryToString(const rtc::binary& data) {
  // rtc::binary is std::vector<std::byte> in libdatachannel >= 0.21
  std::string msg(data.size(), '\0');
  for (size_t i = 0; i < data.size(); i++) {
    msg[i] = static_cast<char>(data[i]);
  }
  return msg;
}

// Holds a Napi::Promise::Deferred so it can be moved into TSFN lambdas
// without invalid copies (node-addon-api 8.x Deferred is not movable).
struct DeferredHolder {
  Promise::Deferred deferred;
  explicit DeferredHolder(Promise::Deferred d) : deferred(d) {}
};

class DataChannelWrap : public Napi::ObjectWrap<DataChannelWrap> {
 public:
  static Function Init(Napi::Env env) {
    Function func = DefineClass(env, "DataChannel", {
      InstanceMethod("send", &DataChannelWrap::Send),
      InstanceMethod("isOpen", &DataChannelWrap::IsOpen),
      InstanceMethod("close", &DataChannelWrap::Close),
      InstanceMethod("onMessage", &DataChannelWrap::OnMessage),
      InstanceMethod("onOpen", &DataChannelWrap::OnOpen),
    });
    dcConstructor = Napi::Persistent(func);
    return func;
  }

  // Create a JS wrapper (calls the JS constructor, returns instance).
  static Object NewInstance(Napi::Env env) {
    return dcConstructor.New({});
  }

  DataChannelWrap(const Napi::CallbackInfo& info)
      : Napi::ObjectWrap<DataChannelWrap>(info) {}

  void Init(std::shared_ptr<rtc::DataChannel> dc) {
    dc_ = dc;
    dc_->onMessage([this](rtc::message_variant data) {
      std::string msg;
      if (std::holds_alternative<rtc::binary>(data)) {
        msg = binaryToString(std::get<rtc::binary>(data));
      } else {
        msg = std::get<std::string>(data);
      }
      if (msgCb_) {
        msgCb_->BlockingCall([msg](Napi::Env env, Function cb) {
          cb.Call({String::New(env, msg)});
        });
      }
    });
    dc_->onOpen([this]() {
      if (openCb_) {
        openCb_->BlockingCall([](Napi::Env env, Function cb) {
          cb.Call({});
        });
      }
    });
  }

 private:
  static FunctionReference dcConstructor;
  std::shared_ptr<rtc::DataChannel> dc_;
  std::shared_ptr<ThreadSafeFunction> msgCb_;
  std::shared_ptr<ThreadSafeFunction> openCb_;

  void Send(const Napi::CallbackInfo& info) {
    std::string msg = info[0].As<String>().Utf8Value();
    if (dc_) dc_->send(msg);
  }

  Napi::Value IsOpen(const Napi::CallbackInfo& info) {
    bool open = dc_ && dc_->isOpen();
    return Boolean::New(info.Env(), open);
  }

  void Close(const Napi::CallbackInfo& info) {
    if (dc_) dc_->close();
  }

  void OnMessage(const Napi::CallbackInfo& info) {
    Function cb = info[0].As<Function>();
    msgCb_ = std::make_shared<ThreadSafeFunction>(
        ThreadSafeFunction::New(info.Env(), cb, "dc-message", 0, 1));
  }

  void OnOpen(const Napi::CallbackInfo& info) {
    Function cb = info[0].As<Function>();
    openCb_ = std::make_shared<ThreadSafeFunction>(
        ThreadSafeFunction::New(info.Env(), cb, "dc-open", 0, 1));
  }
};

class TrackWrap : public Napi::ObjectWrap<TrackWrap> {
 public:
  static Function Init(Napi::Env env) {
    Function func = DefineClass(env, "Track", {
      InstanceMethod("send", &TrackWrap::Send),
      InstanceMethod("isOpen", &TrackWrap::IsOpen),
      InstanceMethod("close", &TrackWrap::Close),
      InstanceMethod("setPacketizer", &TrackWrap::SetPacketizer),
      InstanceMethod("sendFrame", &TrackWrap::SendFrame),
      InstanceMethod("addTimestamp", &TrackWrap::AddTimestamp),
    });
    trackConstructor = Napi::Persistent(func);
    return func;
  }

  static Object NewInstance(Napi::Env env) {
    return trackConstructor.New({});
  }

  TrackWrap(const Napi::CallbackInfo& info)
      : Napi::ObjectWrap<TrackWrap>(info) {}

  void Init(std::shared_ptr<rtc::Track> track, Napi::Env env) {
    track_ = track;
    (void)env;
  }

 private:
  static FunctionReference trackConstructor;
  std::shared_ptr<rtc::Track> track_;
  std::shared_ptr<rtc::RtpPacketizationConfig> rtpConfig_;

  void Send(const Napi::CallbackInfo& info) {
    Buffer<uint8_t> buf = info[0].As<Buffer<uint8_t>>();
    if (!track_) return;
    rtc::binary data(buf.Length());
    for (size_t i = 0; i < buf.Length(); i++) data[i] = (std::byte)buf[i];
    try {
      track_->send(data);
    } catch (const std::exception& e) {
      fprintf(stderr, "[binding] track.send THREW: %s\n", e.what());
    }
  }

  // setPacketizer(kind, ssrc, payloadType, clockRate, playoutDelayId,
  //               playoutDelayMin, playoutDelayMax)
  // kind: "audio" | "h264" | "h265" | "av1"
  // Builds the media-handler chain (packetizer → RTCP SR → NACK → pacing for
  // video) exactly like @dank074's WebRtcWrapper does via node-datachannel.
  void SetPacketizer(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!track_) throw Error::New(env, "track closed");
    std::string kind = info[0].As<String>().Utf8Value();
    uint32_t ssrc = info[1].As<Number>().Uint32Value();
    uint8_t pt = (uint8_t)info[2].As<Number>().Uint32Value();
    uint32_t clockRate = info[3].As<Number>().Uint32Value();
    uint8_t playoutDelayId = (uint8_t)info[4].As<Number>().Uint32Value();
    uint16_t playoutDelayMin = (uint16_t)info[5].As<Number>().Uint32Value();
    uint16_t playoutDelayMax = (uint16_t)info[6].As<Number>().Uint32Value();
    try {
      auto cfg = std::make_shared<rtc::RtpPacketizationConfig>(
          ssrc, "", pt, clockRate);
      cfg->playoutDelayId = playoutDelayId;
      cfg->playoutDelayMin = playoutDelayMin;
      cfg->playoutDelayMax = playoutDelayMax;
      std::shared_ptr<rtc::MediaHandler> handler;
      if (kind == "audio") {
        handler = std::make_shared<rtc::OpusRtpPacketizer>(cfg);
      } else if (kind == "h264") {
        handler = std::make_shared<rtc::H264RtpPacketizer>(
            rtc::NalUnit::Separator::StartSequence, cfg);
      } else if (kind == "h265") {
        handler = std::make_shared<rtc::H265RtpPacketizer>(
            rtc::NalUnit::Separator::StartSequence, cfg);
      } else if (kind == "av1") {
        handler = std::make_shared<rtc::AV1RtpPacketizer>(
            rtc::AV1RtpPacketizer::Packetization::Obu, cfg);
      } else {
        throw std::runtime_error("unknown packetizer kind: " + kind);
      }
      handler->addToChain(std::make_shared<rtc::RtcpSrReporter>(cfg));
      handler->addToChain(std::make_shared<rtc::RtcpNackResponder>());
      if (kind != "audio") {
        handler->addToChain(std::make_shared<rtc::PacingHandler>(
            25.0 * 1000 * 1000, std::chrono::milliseconds(1)));
      }
      track_->setMediaHandler(handler);
      rtpConfig_ = cfg;
    } catch (const std::exception& e) {
      fprintf(stderr, "[binding] setPacketizer THREW: %s\n", e.what());
      throw Error::New(env, e.what());
    }
  }

  // sendFrame(buffer) — sends an ENCODED frame (AnnexB H264 / raw opus /
  // OBU AV1). The media-handler chain packetizes it into RTP.
  void SendFrame(const Napi::CallbackInfo& info) {
    Buffer<uint8_t> buf = info[0].As<Buffer<uint8_t>>();
    if (!track_) return;
    rtc::binary data(buf.Length());
    for (size_t i = 0; i < buf.Length(); i++) data[i] = (std::byte)buf[i];
    try {
      track_->send(data);
    } catch (const std::exception& e) {
      fprintf(stderr, "[binding] track.sendFrame THREW: %s\n", e.what());
    }
  }

  // addTimestamp(delta) — advances the packetizer RTP timestamp by delta
  // (clock-rate units). Called by JS after each frame, matching the
  // node-datachannel contract (WebRtcWrapper does the same increment).
  void AddTimestamp(const Napi::CallbackInfo& info) {
    uint32_t delta = info[0].As<Number>().Uint32Value();
    if (rtpConfig_) rtpConfig_->timestamp += delta;
  }

  Napi::Value IsOpen(const Napi::CallbackInfo& info) {
    bool open = track_ && track_->isOpen();
    return Boolean::New(info.Env(), open);
  }

  void Close(const Napi::CallbackInfo& info) {
    if (track_) track_->close();
  }

  void OnStateChange(const Napi::CallbackInfo& info) {
    // libdatachannel Track has no state-change callback; kept for API parity.
    (void)info;
  }
};
class PeerConnectionWrap : public Napi::ObjectWrap<PeerConnectionWrap> {
 public:
  static Function Init(Napi::Env env) {
    Function func = DefineClass(env, "PeerConnection", {
      InstanceMethod("state", &PeerConnectionWrap::State),
      InstanceMethod("createOffer", &PeerConnectionWrap::CreateOffer),
      InstanceMethod("createAnswer", &PeerConnectionWrap::CreateAnswer),
      InstanceMethod("setRemoteDescription",
                     &PeerConnectionWrap::SetRemoteDescription),
      InstanceMethod("close", &PeerConnectionWrap::Close),
      InstanceMethod("onStateChange", &PeerConnectionWrap::OnStateChange),
      InstanceMethod("createDataChannel", &PeerConnectionWrap::CreateDataChannel),
      InstanceMethod("onDataChannel", &PeerConnectionWrap::OnDataChannel),
      InstanceMethod("addTrack", &PeerConnectionWrap::AddTrack),
    });
    return func;
  }

  PeerConnectionWrap(const Napi::CallbackInfo& info)
      : Napi::ObjectWrap<PeerConnectionWrap>(info) {
    Napi::Env env = info.Env();
    if (!info[0].IsObject()) {
      throw TypeError::New(env, "config object required");
    }
    Object config = info[0].As<Object>();
    rtc::Configuration rtcConfig;
    if (config.Has("iceServers")) {
      Array servers = config.Get("iceServers").As<Array>();
      for (uint32_t i = 0; i < servers.Length(); i++) {
        std::string url = servers.Get(i).As<String>().Utf8Value();
        rtcConfig.iceServers.emplace_back(url);
      }
    }
    pc_ = std::make_shared<rtc::PeerConnection>(rtcConfig);

    // IMPORTANT: register description/gathering callbacks HERE (constructor),
    // BEFORE any createDataChannel call. libdatachannel only fires
    // onLocalDescription for negotiations that start AFTER the callback is
    // registered — if createDataChannel runs first, the offer callback never
    // fires (verified in C++ spike: test3 vs test2).
    pc_->onLocalDescription([this](rtc::Description desc) {
      latestLocalDesc_ = std::string(desc);
      fprintf(stderr, "[binding] trickle desc, %zu bytes\n",
              latestLocalDesc_.size());
    });
    pc_->onGatheringStateChange([this](rtc::PeerConnection::GatheringState gs) {
      fprintf(stderr, "[binding] gathering state: %d\n", (int)gs);
      if (gs == rtc::PeerConnection::GatheringState::Complete) {
        // Use the getter — it returns the FULL SDP including candidates after
        // gathering (trickle callbacks only carry the initial fragment).
        auto ld = pc_->localDescription();
        if (ld) {
          latestLocalDesc_ = std::string(*ld);
          fprintf(stderr, "[binding] final desc, %zu bytes\n",
                  latestLocalDesc_.size());
        }
        resolvePendingLocalDesc_();
      }
    });
  }

 private:
  std::shared_ptr<rtc::PeerConnection> pc_;
  std::shared_ptr<ThreadSafeFunction> stateCb_;
  std::shared_ptr<ThreadSafeFunction> dcCb_;
  std::string latestLocalDesc_;
  std::shared_ptr<DeferredHolder> pendingDescDeferred_;
  std::shared_ptr<ThreadSafeFunction> pendingDescTsfn_;

  void resolvePendingLocalDesc_() {
    if (!pendingDescDeferred_ || !pendingDescTsfn_) return;
    auto holder = pendingDescDeferred_;
    auto tsfn = pendingDescTsfn_;
    pendingDescDeferred_.reset();
    pendingDescTsfn_.reset();
    std::string sdp = latestLocalDesc_;
    tsfn->BlockingCall([sdp, holder](Napi::Env e, Function) {
      holder->deferred.Resolve(String::New(e, sdp));
    });
  }

  Napi::Value State(const Napi::CallbackInfo& info) {
    return String::New(info.Env(),
                       pc_ ? stateToString(pc_->state()) : "closed");
  }

  // createOffer() -> Promise<string> — sets local description, waits for
  // ICE gathering to complete (so candidates are in the SDP), resolves SDP.
  Napi::Value CreateOffer(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    auto holder = std::make_shared<DeferredHolder>(Promise::Deferred::New(env));
    if (!pc_) {
      holder->deferred.Reject(Error::New(env, "peer closed").Value());
      return holder->deferred.Promise();
    }
    // createDataChannel already triggers negotiation in libdatachannel 0.24 —
    // if gathering already completed, resolve immediately from the cached SDP.
    if (!latestLocalDesc_.empty()) {
      auto tsfn = std::make_shared<ThreadSafeFunction>(ThreadSafeFunction::New(
          env, Function::New(env, [](const CallbackInfo&) {}), "desc", 0, 1));
      std::string sdp = latestLocalDesc_;
      tsfn->BlockingCall([sdp, holder](Napi::Env e, Function) {
        holder->deferred.Resolve(String::New(e, sdp));
      });
      return holder->deferred.Promise();
    }
    if (pendingDescDeferred_) {
      pendingDescDeferred_->deferred.Reject(
          Error::New(env, "previous negotiation still pending").Value());
    }
    pendingDescDeferred_ = holder;
    pendingDescTsfn_ = std::make_shared<ThreadSafeFunction>(
        ThreadSafeFunction::New(env, Function::New(env, [](const CallbackInfo&) {}),
                                "desc", 0, 1));
    fprintf(stderr, "[binding] calling setLocalDescription(Offer)\n");
    try {
      pc_->setLocalDescription(rtc::Description::Type::Offer);
      fprintf(stderr, "[binding] setLocalDescription returned OK\n");
    } catch (const std::exception& e) {
      pendingDescDeferred_.reset();
      fprintf(stderr, "[binding] setLocalDescription THREW: %s\n", e.what());
      throw Error::New(env, e.what());
    }
    return holder->deferred.Promise();
  }

  // createAnswer(offerSdp: string) -> Promise<string>
  Napi::Value CreateAnswer(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::string offer = info[0].As<String>().Utf8Value();
    auto holder = std::make_shared<DeferredHolder>(Promise::Deferred::New(env));
    if (!pc_) {
      holder->deferred.Reject(Error::New(env, "peer closed").Value());
      return holder->deferred.Promise();
    }
    if (pendingDescDeferred_) {
      pendingDescDeferred_->deferred.Reject(
          Error::New(env, "previous negotiation still pending").Value());
    }
    pendingDescDeferred_ = holder;
    pendingDescTsfn_ = std::make_shared<ThreadSafeFunction>(
        ThreadSafeFunction::New(env, Function::New(env, [](const CallbackInfo&) {}),
                                "desc", 0, 1));
    try {
      pc_->setRemoteDescription(
          rtc::Description(offer, rtc::Description::Type::Offer));
      fprintf(stderr, "[binding] answer: setRemoteDescription OK\n");
      // libdatachannel 0.24 AUTO-GENERATES the answer when a remote offer is
      // applied (verified in C++ spike test8/9: B desc type=Answer fires
      // immediately with a=setup:active). Calling setLocalDescription() again
      // would OVERWRITE it with a role=actpass SDP, which A rejects with
      // "Illegal role actpass in remote answer description". So we do NOT call
      // setLocalDescription here — we just wait for gathering complete and
      // resolve with the auto-generated answer. This also matches @dank074's
      // Discord voice flow.
    } catch (const std::exception& e) {
      pendingDescDeferred_.reset();
      fprintf(stderr, "[binding] answer THREW: %s\n", e.what());
      holder->deferred.Reject(Error::New(env, e.what()).Value());
    }
    return holder->deferred.Promise();
  }

  void SetRemoteDescription(const Napi::CallbackInfo& info) {
    std::string sdp = info[0].As<String>().Utf8Value();
    std::string type = info[1].As<String>().Utf8Value();
    rtc::Description::Type t = (type == "answer")
                                   ? rtc::Description::Type::Answer
                                   : rtc::Description::Type::Offer;
    if (pc_) pc_->setRemoteDescription(rtc::Description(sdp, t));
  }

  void Close(const Napi::CallbackInfo& info) {
    if (pc_) pc_->close();
  }

  void OnStateChange(const Napi::CallbackInfo& info) {
    Function cb = info[0].As<Function>();
    stateCb_ = std::make_shared<ThreadSafeFunction>(
        ThreadSafeFunction::New(info.Env(), cb, "pc-state", 0, 1));
    std::shared_ptr<rtc::PeerConnection> pc = pc_;
    pc->onStateChange([this](rtc::PeerConnection::State state) {
      if (stateCb_) {
        std::string s = stateToString(state);
        stateCb_->BlockingCall([s](Napi::Env env, Function cb) {
          cb.Call({String::New(env, s)});
        });
      }
    });
  }

  Napi::Value CreateDataChannel(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::string label = info[0].As<String>().Utf8Value();
    fprintf(stderr, "[binding] createDataChannel(%s)\n", label.c_str());
    auto dc = pc_->createDataChannel(label);
    Object obj = DataChannelWrap::NewInstance(env);
    DataChannelWrap::Unwrap(obj)->Init(dc);
    return obj;
  }

  Napi::Value AddTrack(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::string mid = info[0].As<String>().Utf8Value();
    std::string kind = info[1].As<String>().Utf8Value();
    if (!pc_) throw Error::New(env, "peer closed");
    fprintf(stderr, "[binding] addTrack(%s, %s) start\n", mid.c_str(), kind.c_str());
    try {
      std::shared_ptr<rtc::Track> track;
      if (kind == "audio") {
      // Opus payload type 120 (matches @dank074 CodecPayloadType.opus)
      auto desc = rtc::Description::Audio(mid);
      desc.addOpusCodec(120);
      track = pc_->addTrack(desc);
      } else {
      // All video codecs with their payload types, matching WebRtcWrapper:
      // H264 101/102, H265 103/104, VP8 105/106, VP9 107/108, AV1 109/110
      auto desc = rtc::Description::Video(mid);
      desc.addH264Codec(101);
      desc.addRtxCodec(102, 101, 90000);
      desc.addH265Codec(103);
      desc.addRtxCodec(104, 103, 90000);
      desc.addVP8Codec(105);
      desc.addRtxCodec(106, 105, 90000);
      desc.addVP9Codec(107);
      desc.addRtxCodec(108, 107, 90000);
      desc.addAV1Codec(109);
      desc.addRtxCodec(110, 109, 90000);
      track = pc_->addTrack(desc);
    }
      Object obj = TrackWrap::NewInstance(env);
      TrackWrap::Unwrap(obj)->Init(track, env);
      return obj;
    } catch (const std::exception& e) {
      fprintf(stderr, "[binding] addTrack THREW: %s\n", e.what());
      throw Error::New(env, e.what());
    }
  }

  void OnDataChannel(const Napi::CallbackInfo& info) {
    Function cb = info[0].As<Function>();
    dcCb_ = std::make_shared<ThreadSafeFunction>(
        ThreadSafeFunction::New(info.Env(), cb, "dc", 0, 1));
    std::shared_ptr<rtc::PeerConnection> pc = pc_;
    pc->onDataChannel([this](std::shared_ptr<rtc::DataChannel> dc) {
      if (dcCb_) {
        auto dcPtr = dc;
        dcCb_->BlockingCall([dcPtr](Napi::Env env, Function cb) {
          Object obj = DataChannelWrap::NewInstance(env);
          DataChannelWrap::Unwrap(obj)->Init(dcPtr);
          cb.Call({obj});
        });
      }
    });
  }
};

Object InitAll(Napi::Env env, Object exports) {
  exports.Set("PeerConnection", PeerConnectionWrap::Init(env));
  exports.Set("DataChannel", DataChannelWrap::Init(env));
  exports.Set("Track", TrackWrap::Init(env));
  return exports;
}

NODE_API_MODULE(libdatachannel_min, InitAll)

// Definition for the static constructor references.
FunctionReference DataChannelWrap::dcConstructor;
FunctionReference TrackWrap::trackConstructor;

}  // namespace
