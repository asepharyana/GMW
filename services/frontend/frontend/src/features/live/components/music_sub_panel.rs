use leptos::prelude::*;

/// MusicSubPanel — Music playlist controls and URL input
#[component]
pub fn MusicSubPanel(
    #[prop(optional)] on_queue: Option<Box<dyn Fn(String) + Send + Sync + 'static>>,
) -> impl IntoView {
    let (url_input, set_url_input) = signal::<String>(String::new());

    let handle_queue_click = move |_| {
        let url = url_input.get_untracked().trim().to_string();
        if !url.is_empty() {
            if let Some(ref cb) = on_queue {
                cb(url.clone());
                set_url_input.set(String::new());
            }
        }
    };

    view! {
        <div class="card">
            <div class="card-header">
                <div class="card-title" style="display:flex;align-items:center;gap:var(--space-2)">
                    <svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M9 8h6v8h-6z"></path>
                    </svg>
                    "Music"
                </div>
            </div>
            <div class="card-content music-body">
                <div class="music-body">
                    <label style="font-size:0.75rem;font-weight:500;color:var(--text-secondary)">"YouTube URL or Search"</label>
                    <input
                        type="text"
                        class="input"
                        placeholder="youtube.com/watch?v=... or song name"
                        prop:value=url_input
                        on:input=move |ev| set_url_input.set(event_target_value(&ev))
                    />
                </div>
                <button
                    class="btn btn-primary"
                    style="width:100%"
                    on:click=handle_queue_click
                    disabled=move || url_input.get().is_empty()
                >
                    "Queue Music"
                </button>
            </div>
        </div>
    }
}
