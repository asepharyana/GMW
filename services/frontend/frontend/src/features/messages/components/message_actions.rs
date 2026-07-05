use leptos::prelude::*;
use shared_types::message::AiStatus;
use std::sync::Arc;

// ─── Reanalyze Button ────────────────────────────────────
#[component]
pub fn ReanalyzeButton(
    message_id: String,
    ai_status: AiStatus,
    on_reanalyze: Arc<dyn Fn(String) + Send + Sync + 'static>,
) -> impl IntoView {
    let on_click_re = move |_| on_reanalyze(message_id.clone());
    view! {
        <div class="msg-actions">
            <button
                class=format!("btn btn-sm {}", if ai_status == AiStatus::Error { "btn-destructive" } else { "btn-outline" })
                on:click=on_click_re
                disabled=ai_status == AiStatus::Processing
            >
                <svg class="h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"></path></svg>
                " Re-analyze"
            </button>
            {(ai_status == AiStatus::Error).then(|| view! {
                <span class="msg-retry-hint">"Click to retry"</span>
            })}
        </div>
    }
}
