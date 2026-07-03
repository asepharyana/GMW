use leptos::prelude::*;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::spawn_local;
use web_sys::{MediaStream, MediaStreamConstraints, MediaStreamTrack};

/// AudioTransmitState — Manages microphone capture state
pub struct AudioTransmitState {
    pub active: RwSignal<bool>,
    pub stream: StoredValue<Option<MediaStream>>,
}

/// Create microphone transmit state
pub fn use_audio_transmit() -> AudioTransmitState {
    let active = create_rw_signal::<bool>(false);
    let stream = StoredValue::new(None::<MediaStream>);
    AudioTransmitState { active, stream }
}

/// Start microphone capture - requests getUserMedia and stores the stream
pub fn start_transmit(state: &AudioTransmitState) {
    if state.active.get() {
        return;
    }
    state.active.set(true);

    let constraints = MediaStreamConstraints::new();
    let _ = js_sys::Reflect::set(
        &constraints,
        &JsValue::from_str("audio"),
        &JsValue::from_bool(true),
    );

    let window = match web_sys::window() {
        Some(w) => w,
        None => return,
    };
    let media_devices = match window.navigator().media_devices() {
        Ok(md) => md,
        Err(_) => return,
    };

    let promise = match media_devices.get_user_media_with_constraints(&constraints) {
        Ok(p) => p,
        Err(_) => return,
    };

    // Clone signals before spawning async task to avoid reference escaping
    let active_signal = state.active;
    let stream_signal = state.stream;

    spawn_local(async move {
        match wasm_bindgen_futures::JsFuture::from(promise).await {
            Ok(val) => {
                if let Ok(s) = val.dyn_into::<MediaStream>() {
                    stream_signal.set_value(Some(s));
                }
            }
            Err(_) => {
                active_signal.set(false);
            }
        }
    });
}

/// Stop microphone transmission
pub fn stop_transmit(state: &AudioTransmitState) {
    state.active.set(false);
    state.stream.update_value(|s| {
        if let Some(stream) = s.take() {
            let tracks = stream.get_tracks();
            for i in 0..tracks.length() {
                let track_val = tracks.get(i);
                if let Ok(track) = track_val.dyn_into::<MediaStreamTrack>() {
                    track.stop();
                }
            }
        }
    });
}
