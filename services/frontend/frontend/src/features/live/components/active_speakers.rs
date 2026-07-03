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
                        <div class="space-y-2">
                            <For
                                each=move || speakers.get()
                                key=|s| s.user_id.clone() + &s.username
                                let:speaker
                            >
                                <div class="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                                    <div class="h-8 w-8 flex-shrink-0">
                                        {speaker.avatar.as_ref().map(|avatar_url| {
                                            let url = avatar_url.clone();
                                            view! {
                                                <img
                                                    src=url
                                                    alt=""
                                                    class="h-8 w-8 rounded-full object-cover ring-2 ring-primary/30"
                                                />
                                            }
                                        })}
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <div class="truncate text-sm font-medium">
                                            {speaker.username.clone()}
                                        </div>
                                        <div class="flex items-center gap-1.5">
                                            <span class=move || {
                                                if speaker.speaking {
                                                    "inline-block h-2 w-2 rounded-full bg-emerald-500"
                                                } else {
                                                    "inline-block h-2 w-2 rounded-full bg-muted-foreground/40"
                                                }
                                            }></span>
                                            <span class=move || {
                                                if speaker.speaking {
                                                    "text-xs font-medium text-emerald-600 dark:text-emerald-400"
                                                } else {
                                                    "text-xs font-medium text-muted-foreground"
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
                <div class="rounded-xl border border-border bg-card p-8 text-center shadow-sm">
                    <div class="space-y-2">
                        <div class="text-4xl">
                            "🎤"
                        </div>
                        <p class="text-sm text-muted-foreground">
                            "No active speakers"
                        </p>
                    </div>
                </div>
            </Show>
        </div>
    }
}
