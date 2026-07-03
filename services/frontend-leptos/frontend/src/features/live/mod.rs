pub mod components;
pub mod hooks;
pub mod audio;

use leptos::prelude::*;
use crate::ws::context::WsContext;
use components::{
    VoiceConnectionCard, ActiveSpeakers, AudioVisualizer,
    NowPlaying, MusicSubPanel, ScreenSubPanel, RecordingsSubPanel,
};

/// LivePanel — Composition shell for all voice and media components
#[component]
pub fn LivePanel() -> impl IntoView {
    let ws = use_context::<WsContext>();

    view! {
        <div class="live-panel space-y-6">
            <div class="flex items-center justify-between">
                <div>
                    <h2 class="text-2xl font-bold tracking-tight">"Voice & Media"</h2>
                    <p class="text-sm text-muted-foreground mt-1">
                        "Monitor voice channels, play music, share your screen, and browse recordings."
                    </p>
                </div>
            </div>

            {/* Top row: Voice connection + speakers + visualizer */}
            <div class="grid gap-6 lg:grid-cols-3">
                <div class="lg:col-span-2">
                    <VoiceConnectionCard />
                </div>
                <div>
                    <ActiveSpeakers />
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
            <div class="grid gap-6 lg:grid-cols-3">
                <div>
                    <NowPlaying />
                </div>
                <div>
                    <MusicSubPanel />
                </div>
                <div>
                    <ScreenSubPanel />
                </div>
            </div>

            {/* Recordings */}
            <RecordingsSubPanel />
        </div>
    }
}
