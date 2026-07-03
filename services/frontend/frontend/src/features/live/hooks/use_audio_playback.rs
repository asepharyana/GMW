use crate::features::live::audio::pcm_decoder::decode_pcm_frame;
use crate::features::live::audio::ring_buffer::SharedRingBuffer;
use leptos::prelude::*;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// AudioPlaybackState — Manages PCM audio playback from WebSocket binary frames
#[derive(Clone)]
pub struct AudioPlaybackState {
    /// Ring buffer for incoming PCM data
    pub buffer: SharedRingBuffer,
    /// Whether playback is active
    pub active: RwSignal<bool>,
    /// Volume level (0.0-1.0)
    pub volume: RwSignal<f64>,
    /// Abort flag to stop the playback loop (prevents leak on teardown)
    pub abort: Arc<AtomicBool>,
}

/// Create and initialize audio playback state
pub fn use_audio_playback() -> AudioPlaybackState {
    let buffer = SharedRingBuffer::new(44100 * 5); // 5 seconds at 44.1kHz
    let active = RwSignal::new(false);
    let volume = RwSignal::new(0.5);

    AudioPlaybackState {
        buffer,
        active,
        volume,
        abort: Arc::new(AtomicBool::new(false)),
    }
}

/// Process incoming binary data from WebSocket (PCM audio frame)
/// Format: [u32 userId (4 bytes)][i16 samples (N bytes)]
pub fn process_pcm_data(state: &AudioPlaybackState, data: Vec<u8>) {
    if let Some(frame) = decode_pcm_frame(&data) {
        state.buffer.write(&frame.samples);
    }
}

/// Start consuming the ring buffer and playing through AudioContext
/// The loop respects the abort flag in `AudioPlaybackState` for clean teardown.
pub fn start_playback(state: &AudioPlaybackState) {
    if state.active.get_untracked() {
        return;
    }
    state.active.set(true);
    // Reset abort flag for a fresh start
    state.abort.store(false, Ordering::Relaxed);

    let buffer = state.buffer.clone();
    let active = state.active;
    let abort = state.abort.clone();

    wasm_bindgen_futures::spawn_local(async move {
        let ctx = match web_sys::AudioContext::new() {
            Ok(ctx) => ctx,
            Err(_) => {
                active.set(false);
                return;
            }
        };

        let ctx_ref = &ctx;
        let _ = ctx_ref.resume();

        while active.get_untracked() && !abort.load(Ordering::Relaxed) {
            let available = buffer.available_samples();
            if available >= 4410 {
                // ~100ms worth at 44.1kHz
                let samples = buffer.read(4410);
                if !samples.is_empty() {
                    play_samples(&ctx, &samples);
                }
            }
            let _ = gloo_timers::future::TimeoutFuture::new(50).await;
        }

        let _ = ctx.close();
    });
}

/// Stop playback and clear buffer
pub fn stop_playback(state: &AudioPlaybackState) {
    state.abort.store(true, Ordering::Relaxed);
    state.active.set(false);
    state.buffer.clear();
}

/// Play a chunk of PCM samples through AudioContext using AudioBufferSourceNode
fn play_samples(ctx: &web_sys::AudioContext, samples: &[f32]) {
    let frame_count = samples.len() as u32;
    let Ok(audio_buffer) = ctx.create_buffer(1, frame_count, ctx.sample_rate()) else {
        return;
    };

    // Write samples into the buffer channel
    let Ok(channel_data) = audio_buffer.get_channel_data(0) else {
        return;
    };

    let len = samples.len().min(channel_data.len());
    if len == 0 {
        return;
    }

    // Copy samples directly to audio buffer channel
    let _ = audio_buffer.copy_to_channel(&samples[..len], 0);

    // Create source and play
    if let Ok(source) = ctx.create_buffer_source() {
        source.set_buffer(Some(&audio_buffer));
        source.set_loop(false);
        let _ = source.start();
    }
}
