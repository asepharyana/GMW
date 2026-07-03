// services/frontend-leptos/frontend/src/ws/socket.rs
use leptos::prelude::*;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{WebSocket, MessageEvent, CloseEvent, ErrorEvent};

#[derive(Debug, Clone, PartialEq)]
pub enum WsStatus {
    Disconnected,
    Connecting,
    Connected,
    Error(String),
}

#[derive(Debug, Clone)]
pub enum WsEvent {
    Text(String),
    Binary(Vec<u8>),
}

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
        let (status, set_status) = create_signal(WsStatus::Disconnected);
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
        if self.status.get() == WsStatus::Connected || self.status.get() == WsStatus::Connecting {
            return;
        }
        self.set_status.set(WsStatus::Connecting);

        let url = self.url.clone();
        let status_clone = self.set_status.clone();
        // Clone the Rc wrapper (cheap pointer copy, inner RefCell is shared)
        let event_clone: std::rc::Rc<std::cell::RefCell<Option<Box<dyn Fn(WsEvent)>>>> = self.on_event.clone();
        let ws_holder = &self.ws as *const std::cell::RefCell<Option<WebSocket>>;
        let reconnect_attempt = &self.reconnect_attempt as *const std::cell::Cell<u32>;

        // Clone again for closures
        let status2 = status_clone.clone();
        let status3 = status_clone.clone();

        match WebSocket::new(&url) {
            Ok(ws) => {
                // Store reference
                unsafe { *(*ws_holder).borrow_mut() = Some(ws.clone()) };

                // onopen
                let onopen_cb = Closure::<dyn Fn(web_sys::ProgressEvent)>::new(move |_| {
                    status_clone.set(WsStatus::Connected);
                    unsafe { (*reconnect_attempt).set(0) };
                });
                ws.set_onopen(Some(onopen_cb.as_ref().unchecked_ref()));
                onopen_cb.forget();

                // onclose
                let onclose_cb = Closure::<dyn Fn(CloseEvent)>::new(move |_| {
                    status2.set(WsStatus::Disconnected);
                    unsafe { *(*ws_holder).borrow_mut() = None };
                });
                ws.set_onclose(Some(onclose_cb.as_ref().unchecked_ref()));
                onclose_cb.forget();

                // onerror
                let onerror_cb = Closure::<dyn Fn(ErrorEvent)>::new(move |e: ErrorEvent| {
                    let msg = e.message();
                    status3.set(WsStatus::Error(msg));
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
                            // Try Blob
                            let data = e.data();
                            let blob = data.dyn_ref::<web_sys::Blob>();
                            if blob.is_some() {
                                // Blob handling would need async FileReader — skip for now
                            }
                        }
                    }
                });
                ws.set_onmessage(Some(onmsg_cb.as_ref().unchecked_ref()));
                onmsg_cb.forget();
            }
            Err(e) => {
                status_clone.set(WsStatus::Error(
                    js_sys::Error::from(e).to_string().as_string().unwrap_or_default(),
                ));
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
