use leptos::prelude::*;
use shared_types::media::MediaState;

/// NowPlaying — Displays current media item and queue info
#[component]
pub fn NowPlaying(
    #[prop(optional)] state: Option<MediaState>,
    #[prop(optional)] on_skip: Option<Box<dyn Fn() + Send + Sync + 'static>>,
    #[prop(optional)] on_stop: Option<Box<dyn Fn() + Send + Sync + 'static>>,
) -> impl IntoView {
    let media_state = RwSignal::new(state);

    // Wrap callbacks in StoredValue for shareable non-Clone ownership in Leptos context
    let skip_cb = StoredValue::new(on_skip);
    let stop_cb = StoredValue::new(on_stop);
    let has_skip = skip_cb.with_value(|v| v.is_some());
    let has_stop = stop_cb.with_value(|v| v.is_some());

    view! {
        <div class="now-playing card">
            <div class="card-header">
                <div class="card-title">"Now Playing"</div>
            </div>
            <div class="card-content space-y-3">
                {move || {
                    media_state.get().map(|ms| {
                        let current = ms.current.as_ref().cloned();
                        let queue_len = ms.queue.len();

                        view! {
                            <>
                                {current.map(|item| {
                                    let title = item.title.clone().unwrap_or_else(|| "Unknown".to_string());
                                    let duration_ms = item.duration_ms.unwrap_or(0);
                                    let duration_sec = duration_ms / 1000;
                                    view! {
                                        <div class="space-y-2">
                                            <div class="text-sm font-medium text-foreground truncate">
                                                {title}
                                            </div>
                                            <div class="flex items-center justify-between text-xs text-muted-foreground">
                                                <span>{format!("{}s", duration_sec)}</span>
                                            </div>
                                            <div class="flex items-center gap-2">
                                                {has_skip.then(|| {
                                                    view! {
                                                        <button
                                                            class="btn btn-sm btn-outline flex-1"
                                                            on:click=move |_| { skip_cb.with_value(|cb| { if let Some(cb) = cb { cb(); } }); }
                                                        >
                                                            "⏭ Skip"
                                                        </button>
                                                    }
                                                })}
                                                {has_stop.then(|| {
                                                    view! {
                                                        <button
                                                            class="btn btn-sm btn-destructive flex-1"
                                                            on:click=move |_| { stop_cb.with_value(|cb| { if let Some(cb) = cb { cb(); } }); }
                                                        >
                                                            "⏹ Stop"
                                                        </button>
                                                    }
                                                })}
                                            </div>
                                        </div>
                                    }
                                })}

                                {(queue_len > 0).then(|| {
                                    view! {
                                        <div class="border-t border-border/50 pt-3">
                                            <div class="text-xs font-medium text-muted-foreground">
                                                {format!("Queue: {} item{}", queue_len, if queue_len == 1 { "" } else { "s" })}
                                            </div>
                                        </div>
                                    }
                                })}

                                {(queue_len == 0).then(|| {
                                    view! {
                                        <div class="text-xs text-muted-foreground text-center py-2">
                                            "Queue is empty"
                                        </div>
                                    }
                                })}
                            </>
                        }
                    })
                }}

                {move || {
                    media_state.get().is_none().then(|| {
                        view! {
                            <div class="text-xs text-muted-foreground text-center py-4">
                                "No media connected"
                            </div>
                        }
                    })
                }}
            </div>
        </div>
    }
}
