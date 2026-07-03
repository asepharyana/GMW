use leptos::prelude::*;
use wasm_bindgen::JsCast;

/// WaveformPlayer — Audio player with waveform progress bar
#[component]
pub fn WaveformPlayer(
    audio_url: String,
    #[prop(default = "Recording".to_string())] title: String,
) -> impl IntoView {
    let is_playing = RwSignal::new(false);
    let current_time = RwSignal::new(0.0);
    let duration = RwSignal::new(0.0);
    let audio_id = format!("audio_{}", audio_url);

    // Clone audio_url for the audio element
    let audio_src = audio_url.clone();
    let audio_src_for_id = audio_src.clone();

    let toggle_play = move |_| {
        let doc = web_sys::window().unwrap().document().unwrap();
        let audio_opt = doc.get_element_by_id(&format!("audio_{}", audio_src_for_id));
        if let Some(audio_el) = audio_opt {
            if let Ok(audio) = audio_el.dyn_into::<web_sys::HtmlAudioElement>() {
                if is_playing.get_untracked() {
                    let _ = audio.pause();
                    is_playing.set(false);
                } else {
                    if audio.ended() {
                        audio.set_current_time(0.0);
                    }
                    if audio.play().is_ok() {
                        is_playing.set(true);
                    }
                }
            }
        }
    };

    let _ = audio_url; // Mark as used for the audio_id

    view! {
        <div class="waveform-player border border-border/50 rounded-lg p-3 bg-surface/30">
            <audio
                id=audio_id.clone()
                preload="auto"
                src=audio_src
                class="hidden"
                on:timeupdate=move |ev| {
                    if let Some(target) = ev.target() {
                        if let Ok(audio) = target.dyn_into::<web_sys::HtmlAudioElement>() {
                            let ct = audio.current_time();
                            let dur = audio.duration();
                            current_time.set(ct);
                            if dur.is_finite() && dur > 0.0 {
                                duration.set(dur);
                            }
                            if audio.ended() {
                                is_playing.set(false);
                            }
                        }
                    }
                }
            ></audio>

            <div class="h-2 rounded-full bg-surface border border-border/50 overflow-hidden mb-2">
                <div
                    class="h-full rounded-full bg-primary transition-all duration-200"
                    style=move || format!("width: {}%", progress_pct(current_time.get(), duration.get()))
                ></div>
            </div>

            <div class="flex items-center justify-between">
                <button
                    class=move || format!("btn btn-sm {}", if is_playing.get() { "btn-secondary" } else { "btn-primary" })
                    on:click=toggle_play
                >
                    {move || if is_playing.get() { "⏸" } else { "▶" }}
                </button>

                <div class="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                    <span>{move || format_time(current_time.get())}</span>
                    <span class="max-w-32 truncate">{title.clone()}</span>
                </div>
            </div>
        </div>
    }
}

fn progress_pct(current: f64, dur: f64) -> f64 {
    if dur > 0.0 {
        (current / dur * 100.0).min(100.0)
    } else {
        0.0
    }
}

fn format_time(secs: f64) -> String {
    if !secs.is_finite() || secs < 0.0 {
        return "00:00".to_string();
    }
    let total = secs as u32;
    format!("{:02}:{:02}", total / 60, total % 60)
}
