use leptos::prelude::*;
use shared_types::media::MediaState;
use crate::api::voice::{
    get_media_status, media_queue, media_skip, media_stop, media_volume,
};
use std::sync::Arc;
use wasm_bindgen_futures::spawn_local;

/// Callback type for enqueue
pub type EnqueueCallback = Arc<dyn Fn(String, String) + Send + Sync>;
/// Callback type for skip_track
pub type SkipTrackCallback = Arc<dyn Fn() + Send + Sync>;
/// Callback type for stop_playback
pub type StopPlaybackCallback = Arc<dyn Fn() + Send + Sync>;
/// Callback type for set_volume
pub type SetVolumeCallback = Arc<dyn Fn(f64) + Send + Sync>;
/// Callback type for refresh
pub type RefreshCallback = Arc<dyn Fn() + Send + Sync>;

/// State returned by use_media_control hook
#[derive(Clone)]
pub struct MediaControlState {
    /// Current media playback state
    pub media_state: RwSignal<Option<MediaState>>,
    /// Whether we're currently loading data
    pub loading: RwSignal<bool>,
    /// Last error message if any
    pub error: RwSignal<Option<String>>,
    /// Enqueue media (source URL, mode: "music" or "screen")
    pub enqueue: EnqueueCallback,
    /// Skip to next track
    pub skip_track: SkipTrackCallback,
    /// Stop all playback
    pub stop_playback: StopPlaybackCallback,
    /// Set volume level (0.0 - 1.0)
    pub set_volume: SetVolumeCallback,
    /// Refresh media status from server
    pub refresh: RefreshCallback,
}

/// Hook to manage media playback state and controls
pub fn use_media_control() -> MediaControlState {
    // Core signals
    let media_state_signal = RwSignal::new(None::<MediaState>);
    let loading_signal = RwSignal::new(false);
    let error_signal = RwSignal::new(None::<String>);

    // Enqueue media
    let enqueue_impl = Arc::new(move |source: String, mode: String| {
        spawn_local({
            let source = source.clone();
            let mode = mode.clone();
            async move {
                error_signal.set(None);
                loading_signal.set(true);

                match media_queue(&source, &mode).await {
                    Ok(state) => {
                        media_state_signal.set(Some(state));
                        loading_signal.set(false);
                    }
                    Err(e) => {
                        error_signal.set(Some(format!("Failed to enqueue media: {}", e)));
                        loading_signal.set(false);
                    }
                }
            }
        });
    });

    // Skip to next track
    let skip_track_impl = Arc::new(move || {
        spawn_local(async move {
            error_signal.set(None);
            loading_signal.set(true);

            match media_skip().await {
                Ok(state) => {
                    media_state_signal.set(Some(state));
                    loading_signal.set(false);
                }
                Err(e) => {
                    error_signal.set(Some(format!("Failed to skip track: {}", e)));
                    loading_signal.set(false);
                }
            }
        });
    });

    // Stop all playback
    let stop_playback_impl = Arc::new(move || {
        spawn_local(async move {
            error_signal.set(None);
            loading_signal.set(true);

            match media_stop().await {
                Ok(state) => {
                    media_state_signal.set(Some(state));
                    loading_signal.set(false);
                }
                Err(e) => {
                    error_signal.set(Some(format!("Failed to stop playback: {}", e)));
                    loading_signal.set(false);
                }
            }
        });
    });

    // Set volume level
    let set_volume_impl = Arc::new(move |volume: f64| {
        spawn_local(async move {
            error_signal.set(None);
            loading_signal.set(true);

            match media_volume(volume).await {
                Ok(state) => {
                    media_state_signal.set(Some(state));
                    loading_signal.set(false);
                }
                Err(e) => {
                    error_signal.set(Some(format!("Failed to set volume: {}", e)));
                    loading_signal.set(false);
                }
            }
        });
    });

    // Refresh media status
    let refresh_impl = Arc::new(move || {
        spawn_local(async move {
            error_signal.set(None);
            loading_signal.set(true);

            match get_media_status().await {
                Ok(state) => {
                    media_state_signal.set(Some(state));
                    loading_signal.set(false);
                }
                Err(e) => {
                    error_signal.set(Some(format!("Failed to refresh media status: {}", e)));
                    loading_signal.set(false);
                }
            }
        });
    });

    MediaControlState {
        media_state: media_state_signal,
        loading: loading_signal,
        error: error_signal,
        enqueue: enqueue_impl,
        skip_track: skip_track_impl,
        stop_playback: stop_playback_impl,
        set_volume: set_volume_impl,
        refresh: refresh_impl,
    }
}
