pub mod audio;
pub mod components;
pub mod hooks;

use crate::app::AuthContext;
use crate::auth::AuthOverlay;
use crate::ws::context::WsContext;
use components::{
    ActiveSpeakers, AudioVisualizer, MusicSubPanel, NowPlaying, RecordingsSubPanel, ScreenSubPanel,
    VoiceConnectionCard,
};
use leptos::prelude::*;
use shared_types::media::MediaState;
use shared_types::voice::ActiveSpeaker;
use crate::{log_debug, log_info, make_logger};

make_logger!();

/// LivePanel — Composition shell for all voice and media components.
/// Shows an auth overlay if not authenticated, otherwise shows voice controls.
#[component]
pub fn LivePanel() -> impl IntoView {
    let auth = use_context::<AuthContext>().expect("AuthContext not provided");
    let ws = use_context::<WsContext>();

    // ── Shared state for WS-driven components ──────────────
    let speakers = RwSignal::new(Vec::<ActiveSpeaker>::new());
    let media_state = RwSignal::new(None::<MediaState>);
    let (recordings_refresh, set_recordings_refresh) = signal(0u64);
    let audio_playback = hooks::use_audio_playback::use_audio_playback();

    // ── Wire WS events (runs on mount, persists while LivePanel is active) ──
    if let Some(ref ws) = ws {
        log_info!("LivePanel wiring WS handlers");
        // Voice active user — update speakers list
        *ws.on_voice_active_user.borrow_mut() = Some(Box::new({
            let speakers = speakers.clone();
            move |speaker: ActiveSpeaker| {
                log_debug!("LivePanel voice_active_user: {}", speaker.user_id);
                speakers.update(|list| {
                    if let Some(pos) = list.iter().position(|s| s.user_id == speaker.user_id) {
                        list[pos] = speaker;
                    } else {
                        list.push(speaker);
                    }
                });
            }
        }));

        // Media state — update NowPlaying
        *ws.on_media_state.borrow_mut() = Some(Box::new({
            let ms = media_state.clone();
            move |state: MediaState| {
                log_debug!("LivePanel media_state received");
                ms.set(Some(state));
            }
        }));

        // Recording uploaded — trigger recordings list refresh
        *ws.on_voice_recording_uploaded.borrow_mut() = Some(Box::new({
            let set_refresh = set_recordings_refresh;
            move |_recording| {
                log_debug!("LivePanel recording_uploaded received");
                set_refresh.update(|v| *v = v.wrapping_add(1));
            }
        }));

        // Binary PCM data — process and play audio
        *ws.on_binary.borrow_mut() = Some(Box::new({
            let playback = audio_playback.clone();
            move |data: Vec<u8>| {
                log_debug!("LivePanel binary PCM data received: {} bytes", data.len());
                hooks::use_audio_playback::process_pcm_data(&playback, data);
                // Auto-start playback on first PCM data
                if !playback.active.get_untracked() {
                    hooks::use_audio_playback::start_playback(&playback);
                }
            }
        }));
    }

    view! {
        <div class="live-panel">
            {move || {
                if auth.authenticated.get() {
                    view! {
                        <div class="live-body">
                            <div class="live-head">
                                <div>
                                    <h2 class="live-title">"Voice & Media"</h2>
                                    <p class="live-desc">
                                        "Monitor voice channels, play music, share your screen, and browse recordings."
                                    </p>
                                </div>
                            </div>

                            {/* Top row: Voice connection + speakers + visualizer */}
                            <div class="live-grid live-grid-3">
                                <div class="live-span-2">
                                    <VoiceConnectionCard />
                                </div>
                                <div>
                                    <ActiveSpeakers speakers=speakers />
                                </div>
                            </div>

                            {/* Audio visualization */}
                            <div class="card">
                                <div class="card-header">
                                    <div class="card-title">"Audio Visualization"</div>
                                </div>
                                <div class="card-content">
                                    <AudioVisualizer />
                                </div>
                            </div>

                            {/* Media controls: Now Playing + Music + Screen */}
                            <div class="live-grid live-grid-3">
                                <div>
                                    <NowPlaying media_rw=media_state />
                                </div>
                                <div>
                                    <MusicSubPanel />
                                </div>
                                <div>
                                    <ScreenSubPanel />
                                </div>
                            </div>

                            {/* Recordings */}
                            <RecordingsSubPanel refresh_trigger=recordings_refresh />
                        </div>
                    }.into_any()
                } else {
                    view! { <AuthOverlay /> }.into_any()
                }
            }}
        </div>
    }
}
