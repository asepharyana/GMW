use leptos::prelude::*;
use shared_types::message::AiStatus;

// ─── Message Analysis ─────────────────────────────────────
#[component]
pub fn MessageAnalysis(
    analysis: String,
    ai_status: AiStatus,
    analysis_summary: String,
) -> impl IntoView {
    let f_cls = if ai_status == AiStatus::Flagged { "flagged" } else { "clean" };
    let icon = if ai_status == AiStatus::Flagged { "🚨" } else { "ℹ️" };
    view! {
        <div class=format!("msg-analysis {}", f_cls)>
            <div class="msg-analysis-row">
                <span class="msg-analysis-icon">{icon}</span>
                <div class="msg-analysis-body">
                    <span class="msg-analysis-summary">{analysis_summary}</span>
                    <div class="msg-analysis-text">{analysis}</div>
                </div>
            </div>
        </div>
    }
}

// ─── Message Error ────────────────────────────────────────
#[component]
pub fn MessageError(
    error: String,
) -> impl IntoView {
    view! {
        <div class="msg-error">
            <span>"AI error: "{error}</span>
        </div>
    }
}
