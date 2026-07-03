// services/frontend-leptos/frontend/src/layout/dashboard_layout.rs
use leptos::children::Children;
use leptos::prelude::*;
use super::header::Header;
use super::mobile_tab_bar::MobileTabBar;
use super::sidebar::Sidebar;
use super::tab_strip::TabStrip;

#[component]
pub fn DashboardLayout(
    children: Children,
) -> impl IntoView {
    view! {
        <div style="display: flex; flex-direction: column; height: 100vh;">
            <Header />
            <div style="flex: 1; display: flex; overflow: hidden;">
                <Sidebar />
                <main style="flex: 1; overflow: auto;">
                    <TabStrip />
                    <div style="padding: 1.5rem; max-width: 1280px;">
                        {children()}
                    </div>
                </main>
            </div>
            <MobileTabBar />
        </div>
    }
}
