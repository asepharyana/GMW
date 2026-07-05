// services/frontend-leptos/frontend/src/ws/connection.rs
use crate::ws::handlers::{WsEvent, WsStatus};
use leptos::prelude::*;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{CloseEvent, ErrorEvent, MessageEvent, WebSocket};
use crate::{log_debug, log_error, log_info, log_trace, log_warn, make_logger};

make_logger!();

#[allow(clippy::type_complexity)]
pub struct WsHandle {
    pub status: ReadSignal<WsStatus>,
    set_status: WriteSignal<WsStatus>,
    ws: std::cell::RefCell<Option<WebSocket>>,
    on_event: std::rc::Rc<std::cell::RefCell<Option<Box<dyn Fn(WsEvent)>>>>,
    url: String,
    reconnect_attempt: std::cell::Cell<u32>,
}

impl WsHandle {
    pub fn new(url: &str) -> Self {
        let (status, set_status) = signal(WsStatus::Disconnected);
        Self {
            status,
            set_status,
            ws: std::cell::RefCell::new(None),
            on_event: std::rc::Rc::new(std::cell::RefCell::new(None)),
            url: url.to_string(),
            reconnect_attempt: std::cell::Cell::new(0),
        }
    }

    pub fn on_event<F>(&self, callback: F)
    where
        F: Fn(WsEvent) + 'static,
    {
        *self.on_event.borrow_mut() = Some(Box::new(callback));
    }

    pub fn connect(&self) {
        if self.status.get_untracked() == WsStatus::Connected
            || self.status.get_untracked() == WsStatus::Connecting
        {
            return;
        }
        self.set_status.set(WsStatus::Connecting);

        let url = self.url.clone();
        let status_clone = self.set_status;
        #[allow(clippy::type_complexity)]
        let event_clone: std::rc::Rc<std::cell::RefCell<Option<Box<dyn Fn(WsEvent)>>>> =
            self.on_event.clone();
        let ws_holder = &self.ws as *const std::cell::RefCell<Option<WebSocket>>;
        let reconnect_attempt = &self.reconnect_attempt as *const std::cell::Cell<u32>;

        Self::perform_connect(
            &url,
            status_clone,
            event_clone,
            ws_holder,
            reconnect_attempt,
        );
    }

    /// Shared connection setup used for both initial connect and reconnection.
    /// Takes raw pointers because it must be callable from `wasm_bindgen` closures
    /// that cannot borrow `self`.
    #[allow(unsafe_code, clippy::type_complexity)]
    fn perform_connect(
        url: &str,
        set_status: WriteSignal<WsStatus>,
        on_event: std::rc::Rc<std::cell::RefCell<Option<Box<dyn Fn(WsEvent)>>>>,
        ws_holder: *const std::cell::RefCell<Option<WebSocket>>,
        reconnect_attempt: *const std::cell::Cell<u32>,
    ) {
        let url_owned = url.to_string();
        let url_close = url_owned.clone();
        let status1 = set_status;
        let status2 = set_status;
        let status3 = set_status;
        let event_clone = on_event.clone();

        match WebSocket::new(&url_owned) {
            Ok(ws) => {
                // Store reference
                unsafe { *(*ws_holder).borrow_mut() = Some(ws.clone()) };

                // onopen
                let onopen_cb = Closure::<dyn Fn(web_sys::ProgressEvent)>::new(move |_| {
                    status1.set(WsStatus::Connected);
                    log_info!("WS connected to {}", url_owned);
                    unsafe { (*reconnect_attempt).set(0) };
                });
                ws.set_onopen(Some(onopen_cb.as_ref().unchecked_ref()));
                onopen_cb.forget();

                // onclose — schedule reconnect with exponential backoff
                let event_for_close = event_clone.clone();
                let onclose_cb = Closure::<dyn Fn(CloseEvent)>::new(move |_| {
                    status2.set(WsStatus::Disconnected);
                    log_info!("WS disconnected from {}", url_close);
                    unsafe { *(*ws_holder).borrow_mut() = None };

                    let attempt = unsafe { (*reconnect_attempt).get() };
                    if attempt >= 20 {
                        status2.set(WsStatus::Error(
                            "Max reconnect attempts reached".to_string(),
                        ));
                        log_error!("WS reconnect max attempts reached for {}", url_close);
                        return;
                    }
                    // Full-jitter exponential backoff: min(1000 * 2^attempt, 30000) * (0.5 + random * 0.5)
                    let base = core::cmp::min(1000u32 * (1u32 << attempt), 30000u32);
                    let jitter = 0.5 + js_sys::Math::random() * 0.5;
                    let delay_ms = (base as f64 * jitter) as u32;
                    unsafe { (*reconnect_attempt).set(attempt + 1) };

                    log_info!("WS reconnecting to {} in {}ms (attempt {})", url_close, delay_ms, attempt + 1);

                    let url_reconnect = url_close.clone();
                    let status_rc = status2;
                    let event_rc = event_for_close.clone();
                    let reconnect_fn = Closure::<dyn Fn()>::new(move || {
                        Self::perform_connect(
                            &url_reconnect,
                            status_rc,
                            event_rc.clone(),
                            ws_holder,
                            reconnect_attempt,
                        );
                    });
                    web_sys::window().and_then(|w| {
                        w.set_timeout_with_callback_and_timeout_and_arguments_0(
                            reconnect_fn.as_ref().unchecked_ref(),
                            delay_ms as i32,
                        )
                        .ok()
                    });
                    reconnect_fn.forget();
                });
                ws.set_onclose(Some(onclose_cb.as_ref().unchecked_ref()));
                onclose_cb.forget();

                // onerror
                let onerror_cb = Closure::<dyn Fn(ErrorEvent)>::new(move |e: ErrorEvent| {
                    log_error!("WS error: {}", e.message());
                    status3.set(WsStatus::Error(e.message()));
                });
                ws.set_onerror(Some(onerror_cb.as_ref().unchecked_ref()));
                onerror_cb.forget();

                // onmessage
                let onmsg_cb = Closure::<dyn Fn(MessageEvent)>::new(move |e: MessageEvent| {
                    if let Some(cb) = &*event_clone.borrow() {
                        if let Some(text) = e.data().as_string() {
                            cb(WsEvent::Text(text));
                        } else if let Some(abuf) = e.data().dyn_ref::<js_sys::ArrayBuffer>() {
                            let len = abuf.byte_length() as usize;
                            let u8view = js_sys::Uint8Array::new(abuf);
                            let mut bytes = vec![0u8; len];
                            u8view.copy_to(&mut bytes);
                            cb(WsEvent::Binary(bytes));
                        } else {
                            // Blob — would need async FileReader, skip for now
                        }
                    }
                });
                ws.set_onmessage(Some(onmsg_cb.as_ref().unchecked_ref()));
                onmsg_cb.forget();
            }
            Err(e) => {
                let msg = js_sys::Error::from(e)
                    .to_string()
                    .as_string()
                    .unwrap_or_default();
                log_error!("WS connect failed: {}", msg);
                set_status.set(WsStatus::Error(msg));
            }
        }
    }

    pub fn disconnect(&self) {
        if let Some(ws) = self.ws.borrow_mut().take() {
            ws.close().ok();
        }
        self.set_status.set(WsStatus::Disconnected);
    }

    pub fn send_text(&self, text: &str) -> Result<(), JsValue> {
        if let Some(ws) = self.ws.borrow().as_ref() {
            ws.send_with_str(text)
        } else {
            Err(JsValue::from_str("WebSocket not connected"))
        }
    }

    pub fn send_binary(&self, data: &[u8]) -> Result<(), JsValue> {
        if let Some(ws) = self.ws.borrow().as_ref() {
            let array = js_sys::Uint8Array::from(data);
            let buffer = array.buffer();
            ws.send_with_array_buffer(&buffer)
        } else {
            Err(JsValue::from_str("WebSocket not connected"))
        }
    }
}

// SAFETY: WsHandle uses Rc/RefCell for cheap cloning in a single-threaded WASM
// environment. The leptos reactive system requires provided contexts to be Send+Sync.
#[allow(unsafe_code)]
unsafe impl Send for WsHandle {}
#[allow(unsafe_code)]
unsafe impl Sync for WsHandle {}
