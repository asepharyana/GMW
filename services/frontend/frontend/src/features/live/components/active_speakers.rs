use leptos::prelude::*;
use shared_types::voice::ActiveSpeaker;

/// ActiveSpeakers component for Leptos
/// Displays a real-time list of speaking users with avatar and status indicator
#[component]
pub fn ActiveSpeakers(
    #[prop(optional)] speakers: RwSignal<Vec<ActiveSpeaker>>,
    #[prop(optional)] class: &'static str,
) -> impl IntoView {
    let empty_state = move || speakers.get().is_empty();

    view! {
        <div class=class>
            <Show
                when=empty_state
                fallback=move || {
                    view! {
                        <div class="speak-list">
                            <For
                                each=move || speakers.get()
                                key=|s| s.user_id.clone() + &s.username
                                let:speaker
                            >
                                <div style="display:flex;align-items:center;gap:0.75rem;border-radius:0.75rem;border:1px solid var(--surface-border);background:var(--surface-base);padding:0.75rem">
                                    <div style="width:2rem;height:2rem;flex-shrink:0">
                                        {speaker.avatar.as_ref().map(|avatar_url| {
                                            let url = avatar_url.clone();
                                            view! {
                                                <img
                                                    src=url
                                                    alt=""
                                                    style="width:2rem;height:2rem;border-radius:9999px;object-fit:cover;box-shadow:0 0 0 2px rgba(35,161,235,0.3)"
                                                />
                                            }
                                        })}
                                    </div>
                                    <div style="min-width:0;flex:1">
                                        <div class="truncate text-sm font-medium">
                                            {speaker.username.clone()}
                                        </div>
                                        <div style="display:flex;align-items:center;gap:0.375rem">
                                            <span style=move || {
                                                if speaker.speaking {
                                                    "display:inline-block;width:0.5rem;height:0.5rem;border-radius:9999px;background:#10b981"
                                                } else {
                                                    "display:inline-block;width:0.5rem;height:0.5rem;border-radius:9999px;background:color-mix(in srgb, var(--text-tertiary) 40%, transparent)"
                                                }
                                            }></span>
                                            <span style=move || {
                                                if speaker.speaking {
                                                    "font-size:0.75rem;font-weight:500;color:#059669"
                                                } else {
                                                    "font-size:0.75rem;font-weight:500;color:var(--text-secondary)"
                                                }
                                            }>
                                                {move || if speaker.speaking { "Speaking" } else { "Silent" }}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </For>
                        </div>
                    }
                }
            >
                <div style="border-radius:0.75rem;border:1px solid var(--surface-border);background:var(--surface-base);padding:2rem;text-align:center">
                    <div>
                        <div style="font-size:2.25rem;line-height:2.5rem">
                            "🎤"
                        </div>
                        <p style="font-size:0.875rem;color:var(--text-secondary)">
                            "No active speakers"
                        </p>
                    </div>
                </div>
            </Show>
        </div>
    }
}
