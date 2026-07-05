// services/frontend-leptos/frontend/src/layout/dashboard_layout.rs
use super::mobile_tab_bar::MobileTabBar;
use super::sidebar::Sidebar;
use leptos::children::Children;
use leptos::prelude::*;

#[component]
pub fn DashboardLayout(children: Children) -> impl IntoView {
    view! {
        <div class="app-shell">
            <Sidebar />
            <main class="app-content" style="padding: 0; max-width: none;">
                {children()}
            </main>
            <MobileTabBar />
        </div>
    }
}
