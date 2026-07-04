use leptos::prelude::*;

/// ScreenSubPanel — Screenshare controls
#[component]
pub fn ScreenSubPanel(
    #[prop(optional)] on_start_stream: Option<Box<dyn Fn() + Send + Sync + 'static>>,
    #[prop(optional)] on_stop_stream: Option<Box<dyn Fn() + Send + Sync + 'static>>,
) -> impl IntoView {
    let (is_streaming, set_is_streaming) = signal::<bool>(false);

    let has_start = on_start_stream.is_some();
    let has_stop = on_stop_stream.is_some();

    view! {
        <div class="card">
            <div class="card-header">
                <div class="card-title" style="display:flex;align-items:center;gap:var(--space-2)">
                    <svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                        <line x1="8" y1="21" x2="16" y2="21"></line>
                        <line x1="12" y1="17" x2="12" y2="21"></line>
                    </svg>
                    "Screenshare"
                </div>
            </div>
            <div class="card-content" style="display:flex;flex-direction:column;gap:var(--space-3)">
                <p style="font-size:0.75rem;color:var(--text-secondary)">
                    "Stream your screen to the voice channel for everyone to see."
                </p>

                <div class="scrn-actions">
                    {has_start.then(|| {
                        view! {
                            <button
                                class=move || format!("btn btn-success flex-1 {}", if is_streaming.get() { "opacity-50" } else { "" })
                                disabled=move || is_streaming.get()
                                on:click=move |_| {
                                    if !is_streaming.get_untracked() {
                                        set_is_streaming.set(true);
                                        if let Some(ref cb) = on_start_stream {
                                            cb();
                                        }
                                    }
                                }
                            >
                                "🔴 Start Stream"
                            </button>
                        }
                    })}

                    {has_stop.then(|| {
                        view! {
                            <button
                                class=move || format!("btn btn-destructive flex-1 {}", if !is_streaming.get() { "opacity-50" } else { "" })
                                disabled=move || !is_streaming.get()
                                on:click=move |_| {
                                    if is_streaming.get_untracked() {
                                        set_is_streaming.set(false);
                                        if let Some(ref cb) = on_stop_stream {
                                            cb();
                                        }
                                    }
                                }
                            >
                                "⏹ Stop Stream"
                            </button>
                        }
                    })}
                </div>

                {move || {
                    is_streaming.get().then(|| {
                        view! {
                            <div class="scrn-status">
                                "🔴 Live streaming..."
                            </div>
                        }
                    })
                }}
            </div>
        </div>
    }
}
