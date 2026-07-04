use crate::api::recordings::{delete_recording, get_recordings};
use leptos::prelude::*;
use shared_types::recording::VoiceRecording;

/// RecordingsSubPanel — Paginated list of voice recordings
/// Accepts an optional refresh_trigger signal to reload when a new recording is uploaded.
#[component]
pub fn RecordingsSubPanel(
    #[prop(optional)] refresh_trigger: Option<ReadSignal<u64>>,
) -> impl IntoView {
    let recordings = RwSignal::new(Vec::<VoiceRecording>::new());
    let loading = RwSignal::new(false);
    let has_more = RwSignal::new(true);
    let next_cursor = RwSignal::new(None::<String>);

    // Load recordings
    let load = move |reset: bool| {
        if loading.get_untracked() {
            return;
        }
        loading.set(true);

        let cursor_val = if reset {
            None
        } else {
            next_cursor.get_untracked()
        };
        wasm_bindgen_futures::spawn_local({
            async move {
                match get_recordings(Some(20), cursor_val.as_deref()).await {
                    Ok(resp) => {
                        if reset {
                            recordings.set(resp.items);
                        } else {
                            let mut current = recordings.get_untracked();
                            current.extend(resp.items);
                            recordings.set(current);
                        }
                        has_more.set(resp.has_more);
                        next_cursor.set(resp.next_cursor);
                    }
                    Err(_) => {
                        if reset {
                            recordings.set(Vec::new());
                        }
                    }
                }
                loading.set(false);
            }
        });
    };

    // Load on mount, and reload when refresh_trigger changes (e.g., new recording uploaded)
    Effect::new(move |_| {
        if let Some(trigger) = refresh_trigger {
            trigger.get(); // Track — re-run when WS signals a new recording
        }
        load(true);
    });

    // Delete recording handler
    let do_delete = move |id: String| {
        wasm_bindgen_futures::spawn_local({
            let id = id.clone();
            async move {
                let _ = delete_recording(&id).await;
                recordings.update(|r| r.retain(|rec| rec.id != id));
            }
        });
    };

    view! {
        <div class="recordings-sub-panel card">
            <div class="card-header">
                <div class="card-title flex items-center gap-2">
                    <svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                        <line x1="12" y1="19" x2="12" y2="23"></line>
                        <line x1="8" y1="23" x2="16" y2="23"></line>
                    </svg>
                    "Recordings"
                </div>
                <p class="card-description">"Voice channel recordings from all sessions."</p>
            </div>
            <div class="card-content">
                {move || {
                    let recs = recordings.get();
                    if recs.is_empty() && !loading.get() {
                        view! {
                            <div class="rec-empty">
                                <p style="font-size:0.875rem;color:var(--text-secondary)">"No recordings yet."</p>
                                <p style="font-size:0.75rem;color:var(--text-secondary)">"Join a voice channel to start recording."</p>
                            </div>
                        }.into_any()
                    } else {
                        view! {
                            <div class="rec-list">
                                {recs.iter().map(|rec| {
                                    let id = rec.id.clone();
                                    let username = rec.username.clone();
                                    let channel_name = rec.channel_name.clone().unwrap_or_default();
                                    let created_at = format_timestamp(rec.created_at);
                                    let has_url = rec.download_url.is_some();
                                    let url = rec.download_url.clone().unwrap_or_default();

                                    view! {
                                        <div class="rec-item">
                                            <div class="rec-info">
                                                <div class="rec-name">{username}</div>
                                                <div class="rec-meta">
                                                    <span>{channel_name}</span>
                                                    <span>"·"</span>
                                                    <span>{format_size(rec.size_bytes)}</span>
                                                    <span>"·"</span>
                                                    <span>{created_at}</span>
                                                </div>
                                            </div>
                                            <div class="rec-actions">
                                                {has_url.then(|| {
                                                    view! {
                                                        <a
                                                            href=url
                                                            target="_blank"
                                                            class="btn btn-sm btn-outline"
                                                        >
                                                            "Download"
                                                        </a>
                                                    }
                                                })}
                                                <button
                                                    class="btn btn-sm btn-ghost text-destructive hover:text-destructive"
                                                    on:click=move |_| do_delete(id.clone())
                                                >
                                                    "🗑"
                                                </button>
                                            </div>
                                        </div>
                                    }
                                }).collect::<Vec<_>>()}
                            </div>
                        }.into_any()
                    }
                }}

                {move || {
                    (has_more.get() && !loading.get()).then(|| {
                        view! {
                            <div class="rec-footer">
                                <button
                                    class="btn btn-sm btn-outline"
                                    on:click=move |_| load(false)
                                >
                                    "Load more"
                                </button>
                            </div>
                        }
                    })
                }}
            </div>
        </div>
    }
}

/// Format file size bytes to human readable
fn format_size(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{} B", bytes)
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    }
}

/// Format timestamp i64 to readable date
fn format_timestamp(ts: i64) -> String {
    let d = js_sys::Date::new(&wasm_bindgen::JsValue::from_f64((ts as f64) * 1000.0));
    d.to_locale_date_string("en-US", &wasm_bindgen::JsValue::UNDEFINED)
        .into()
}
