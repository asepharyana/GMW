use leptos::prelude::*;
use std::sync::{Arc, Mutex};

/// MicLevelMeter — Horizontal level indicator for microphone input
/// Displays 0-100% amplitude as a filling bar with smooth decay
#[component]
pub fn MicLevelMeter(
    #[prop(default = true)] active: bool,
    #[prop(optional)] pcm_data: Option<Arc<Mutex<Vec<f32>>>>,
    #[prop(optional)] label: Option<&'static str>,
) -> impl IntoView {
    let level = create_rw_signal::<f32>(0.0);
    let peak = create_rw_signal::<f32>(0.0);

    // Update level periodically
    create_effect(move |_| {
        if !active {
            return;
        }

        if let Some(ref pcm_arc) = pcm_data {
            if let Ok(pcm_vec) = pcm_arc.lock() {
                let current_level = compute_rms(&pcm_vec);
                level.update(|l| {
                    *l = *l * 0.8 + current_level * 0.2; // Smooth decay
                });
                peak.update(|p| {
                    *p = (*p * 0.95).max(current_level); // Peak hold with decay
                });
            }
        }
    });

    let level_percent = move || (level.get() * 100.0).min(100.0);
    let peak_percent = move || (peak.get() * 100.0).min(100.0);

    // Determine color based on level
    let level_color = move || {
        let l = level.get();
        if l < 0.5 {
            "bg-green-500"
        } else if l < 0.75 {
            "bg-yellow-500"
        } else {
            "bg-red-500"
        }
    };

    view! {
        <div class="mic-level-meter">
            {label.map(|l| view! {
                <label class="text-xs font-medium text-foreground mb-1.5">{l}</label>
            })}
            <div class="flex items-center gap-2">
                {/* Main level bar */}
                <div class="relative flex-1 h-2 rounded-full bg-surface border border-border/50 overflow-hidden">
                    <div
                        class=move || format!("h-full {} transition-all", level_color())
                        style=move || format!("width: {}%", level_percent())
                    ></div>
                    {/* Peak indicator */}
                    <div
                        class="absolute h-full w-0.5 bg-destructive/70"
                        style=move || format!("left: {}%", peak_percent())
                    ></div>
                </div>
                {/* Percentage display */}
                <span class="text-xs font-mono text-muted-foreground w-8 text-right">
                    {move || format!("{}%", (level_percent() as u8))}
                </span>
            </div>
        </div>
    }
}

/// Compute RMS (Root Mean Square) amplitude from PCM samples
/// Returns normalized value 0.0-1.0
fn compute_rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let mean_square = samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32;
    mean_square.sqrt()
}
