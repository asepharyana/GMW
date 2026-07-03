use leptos::prelude::*;
use std::sync::{Arc, Mutex};

/// AudioVisualizer — Real-time 32-bar frequency spectrum display
/// Simplified implementation using CSS bars updated via signals
#[component]
pub fn AudioVisualizer(
    #[prop(default = true)] _active: bool,
    #[prop(optional)] pcm_data: Option<Arc<Mutex<Vec<f32>>>>,
) -> impl IntoView {
    let bars = RwSignal::new(vec![0.0; 32]);
    let (tick, set_tick) = signal(0u32);

    // Drive periodic updates: increment tick every 100ms
    wasm_bindgen_futures::spawn_local(async move {
        loop {
            gloo_timers::future::TimeoutFuture::new(100).await;
            set_tick.update(|t| *t = t.wrapping_add(1));
        }
    });

    // Effect reacts to tick changes, updating bars from PCM data each frame
    Effect::new(move |_| {
        tick.get(); // Track — Effect re-runs on each tick (every 100ms)
        if let Some(ref pcm_arc) = pcm_data {
            if let Ok(pcm_vec) = pcm_arc.lock() {
                let computed = compute_frequency_bands(&pcm_vec);
                bars.update(|b| {
                    for (i, band) in b.iter_mut().enumerate() {
                        let target = computed.get(i).copied().unwrap_or(0.0).clamp(0.0, 1.0);
                        *band = *band * 0.7 + target * 0.3; // Smooth decay
                    }
                });
            }
        }
    });

    view! {
        <div class="audio-visualizer">
            <div class="audio-visualizer-bars">
                {(0..32).map(|i| {
                    view! {
                        <div
                            class="audio-bar"
                            style=move || {
                                let height = bars.get()[i] * 100.0;
                                format!("height: {}%", height)
                            }
                        ></div>
                    }
                }).collect::<Vec<_>>()}
            </div>
        </div>
    }
}

/// Compute 32-band frequency spectrum from PCM samples
fn compute_frequency_bands(pcm_samples: &[f32]) -> Vec<f32> {
    let mut bands = vec![0.0; 32];

    if pcm_samples.is_empty() {
        return bands;
    }

    let samples_per_band = (pcm_samples.len() / 32).max(1);

    for (band_idx, band) in bands.iter_mut().enumerate() {
        let start = band_idx * samples_per_band;
        let end = ((band_idx + 1) * samples_per_band).min(pcm_samples.len());

        if start < pcm_samples.len() {
            let slice = &pcm_samples[start..end];
            let rms = (slice.iter().map(|s| s * s).sum::<f32>() / slice.len() as f32).sqrt();
            *band = rms.min(1.0);
        }
    }

    bands
}
