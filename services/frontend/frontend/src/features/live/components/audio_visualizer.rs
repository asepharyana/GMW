use leptos::prelude::*;
use std::sync::{Arc, Mutex};

/// AudioVisualizer — Real-time 32-bar frequency spectrum display
/// Simplified implementation using CSS bars updated via signals
#[component]
pub fn AudioVisualizer(
    #[prop(default = true)] _active: bool,
    #[prop(optional)] pcm_data: Option<Arc<Mutex<Vec<f32>>>>,
) -> impl IntoView {
    let bars = create_rw_signal::<Vec<f32>>(vec![0.0; 32]);

    // Periodically update bars from PCM data
    create_effect(move |_| {
        if let Some(ref pcm_arc) = pcm_data {
            if let Ok(pcm_vec) = pcm_arc.lock() {
                let computed = compute_frequency_bands(&pcm_vec);
                bars.update(|b| {
                    for i in 0..32 {
                        let target = computed.get(i).copied().unwrap_or(0.0).max(0.0).min(1.0);
                        b[i] = b[i] * 0.7 + target * 0.3; // Smooth decay
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
