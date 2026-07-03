pub mod components;
pub mod hooks;
pub mod audio;

use leptos::prelude::*;
use crate::ui::card::Card;

/// Placeholder LivePanel component for Phase 4 Task 1
/// Will be expanded with voice connection, music player, and recordings components
#[component]
pub fn LivePanel() -> impl IntoView {
    view! {
        <Card class="p-6">
            <div class="space-y-4">
                <h2 class="text-xl font-bold">Live Monitoring</h2>
                <p class="text-gray-600 dark:text-gray-400">
                    Live panel components coming in Phase 4
                </p>
            </div>
        </Card>
    }
}
