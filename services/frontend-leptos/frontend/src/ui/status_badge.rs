// services/frontend-leptos/frontend/src/ui/status_badge.rs
use leptos::prelude::*;
use shared_types::message::AiStatus;

#[component]
pub fn StatusBadge(status: AiStatus) -> impl IntoView {
    let (class, label) = match status {
        AiStatus::Flagged => ("status-badge-flagged", "Flagged"),
        AiStatus::Clean => ("status-badge-clean", "Clean"),
        AiStatus::Warn => ("status-badge-warn", "Warned"),
        AiStatus::Pending => ("status-badge-pending", "Pending"),
        AiStatus::Processing => ("status-badge-processing", "Processing"),
        AiStatus::Error => ("status-badge-error", "Error"),
    };
    let combined = format!("status-badge {}", class);
    view! {
        <span class=combined>
            {label}
        </span>
    }
}
