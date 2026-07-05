// services/frontend-leptos/frontend/src/ws/context.rs
use crate::ws::connection::WsHandle;
use crate::ws::handlers::{WsEvent, WsStatus};
use leptos::prelude::*;
use shared_types::media::MediaState;
use shared_types::message::MessageRecord;
use shared_types::recording::VoiceRecording;
use shared_types::voice::ActiveSpeaker;
use crate::{log_debug, log_error, log_info, log_trace, log_warn, make_logger};

make_logger!();

#[derive(Clone)]
#[allow(clippy::type_complexity)]
pub struct WsContext {
    pub handle: std::rc::Rc<WsHandle>,
    pub status: ReadSignal<WsStatus>,
    // Per-event callbacks (set externally by feature components)
    // Wrapped in Rc so cloning shares the same callback slots
    pub on_message_created: std::rc::Rc<std::cell::RefCell<Option<Box<dyn Fn(MessageRecord)>>>>,
    pub on_message_updated: std::rc::Rc<std::cell::RefCell<Option<Box<dyn Fn(MessageRecord)>>>>,
    pub on_message_deleted: std::rc::Rc<std::cell::RefCell<Option<Box<dyn Fn(String)>>>>,
    pub on_message_analyzed: std::rc::Rc<std::cell::RefCell<Option<Box<dyn Fn(MessageRecord)>>>>,
    pub on_voice_active_user: std::rc::Rc<std::cell::RefCell<Option<Box<dyn Fn(ActiveSpeaker)>>>>,
    pub on_voice_recording_uploaded:
        std::rc::Rc<std::cell::RefCell<Option<Box<dyn Fn(VoiceRecording)>>>>,
    pub on_media_state: std::rc::Rc<std::cell::RefCell<Option<Box<dyn Fn(MediaState)>>>>,
    pub on_binary: std::rc::Rc<std::cell::RefCell<Option<Box<dyn Fn(Vec<u8>)>>>>,
}

impl WsContext {
    pub fn new(url: &str) -> Self {
        let ws_handle = std::rc::Rc::new(WsHandle::new(url));
        let status = ws_handle.status;

        let ctx = Self {
            status,
            handle: ws_handle,
            on_message_created: std::rc::Rc::new(std::cell::RefCell::new(None)),
            on_message_updated: std::rc::Rc::new(std::cell::RefCell::new(None)),
            on_message_deleted: std::rc::Rc::new(std::cell::RefCell::new(None)),
            on_message_analyzed: std::rc::Rc::new(std::cell::RefCell::new(None)),
            on_voice_active_user: std::rc::Rc::new(std::cell::RefCell::new(None)),
            on_voice_recording_uploaded: std::rc::Rc::new(std::cell::RefCell::new(None)),
            on_media_state: std::rc::Rc::new(std::cell::RefCell::new(None)),
            on_binary: std::rc::Rc::new(std::cell::RefCell::new(None)),
        };

        // Wire up the main event dispatcher
        let ctx_clone = ctx.clone();
        ctx.handle.on_event(move |event| {
            ctx_clone.dispatch_event(event);
        });

        ctx
    }

    fn dispatch_event(&self, event: WsEvent) {
        match event {
            WsEvent::Text(text) => {
                // Parse JSON envelope: { type: string, data?: any }
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                    let event_type = parsed["type"].as_str().unwrap_or("").to_string();
                    let data = parsed.get("data");

                    match event_type.as_str() {
                        "message_created" => {
                            log_debug!("WS event: message_created");
                            if let Some(d) = data.and_then(|v| {
                                serde_json::from_value::<MessageRecord>(v.clone()).ok()
                            }) {
                                if let Some(cb) = self.on_message_created.borrow().as_ref() {
                                    cb(d);
                                }
                            }
                        }
                        "message_updated" => {
                            log_debug!("WS event: message_updated");
                            if let Some(d) = data.and_then(|v| {
                                serde_json::from_value::<MessageRecord>(v.clone()).ok()
                            }) {
                                if let Some(cb) = self.on_message_updated.borrow().as_ref() {
                                    cb(d);
                                }
                            }
                        }
                        "message_deleted" => {
                            log_debug!("WS event: message_deleted");
                            if let Some(d) = data.and_then(|v| v.as_str().map(String::from)) {
                                if let Some(cb) = self.on_message_deleted.borrow().as_ref() {
                                    cb(d);
                                }
                            }
                        }
                        "message_analyzed" => {
                            log_debug!("WS event: message_analyzed");
                            if let Some(d) = data.and_then(|v| {
                                serde_json::from_value::<MessageRecord>(v.clone()).ok()
                            }) {
                                if let Some(cb) = self.on_message_analyzed.borrow().as_ref() {
                                    cb(d);
                                }
                            }
                        }
                        "voice_active_user" => {
                            log_debug!("WS event: voice_active_user");
                            if let Some(d) = data.and_then(|v| {
                                serde_json::from_value::<ActiveSpeaker>(v.clone()).ok()
                            }) {
                                if let Some(cb) = self.on_voice_active_user.borrow().as_ref() {
                                    cb(d);
                                }
                            }
                        }
                        "voice_recording_uploaded" => {
                            log_debug!("WS event: voice_recording_uploaded");
                            if let Some(d) = data.and_then(|v| {
                                serde_json::from_value::<VoiceRecording>(v.clone()).ok()
                            }) {
                                if let Some(cb) = self.on_voice_recording_uploaded.borrow().as_ref()
                                {
                                    cb(d);
                                }
                            }
                        }
                        "media_state" => {
                            log_debug!("WS event: media_state");
                            // Backend sends initial state with "state" key, live updates with "data"
                            let raw = data.or_else(|| parsed.get("state")).cloned();
                            if let Some(d) =
                                raw.and_then(|v| serde_json::from_value::<MediaState>(v).ok())
                            {
                                if let Some(cb) = self.on_media_state.borrow().as_ref() {
                                    cb(d);
                                }
                            }
                        }
                        _ => {
                            // Unknown event type — log and ignore
                            log_warn!("WS unhandled event type: {}", event_type);
                        }
                    }
                }
            }
            WsEvent::Binary(data) => {
                log_debug!("WS event: binary ({} bytes)", data.len());
                if let Some(cb) = self.on_binary.borrow().as_ref() {
                    cb(data);
                }
            }
        }
    }

    pub fn connect(&self) {
        self.handle.connect();
    }

    pub fn disconnect(&self) {
        self.handle.disconnect();
    }

    pub fn send_text(&self, text: &str) {
        let _ = self.handle.send_text(text);
    }

    pub fn send_binary(&self, data: &[u8]) {
        let _ = self.handle.send_binary(data);
    }
}

// SAFETY: WsContext uses Rc/RefCell for cheap cloning in a single-threaded WASM
// environment. The leptos reactive system requires provided contexts to be Send+Sync.
#[allow(unsafe_code)]
unsafe impl Send for WsContext {}
#[allow(unsafe_code)]
unsafe impl Sync for WsContext {}
